# 08 面板：只显示需要人的事

::: info 本章
**前置：** [05 执行](./05-execution)、[07 Prompt](./07-prompts)
**对应上游：** <Doc page="005-panel">005 面板</Doc>
**对应源码：** <Src path="src/app/views/overview.ts" />、<Src path="src/client/overview.tsx" />、<Src path="src/client/app.tsx" />、<Src path="src/app/views/" label="src/app/views/" />
:::

::: tip 带着这些问题读
1. 打开面板时，第一屏回答的是哪个问题？什么情况下它几乎是空的？
2. "系统健康"在代码里是怎样被隐藏起来的？一次网络抖动会不会出现在面板上？
3. Overview 上的每个数字，点进去看到的列表有多长？哪个数字故意不给链接，为什么？
4. 把注意力预算用到 UI 上，具体变成了哪些写代码时的规则？
:::

![一块安静、几乎空白的面板，只有一张琥珀色卡片上的机器人举着手，等一个人来处理](/images/quiet-panel.jpg)

你可能用过这样的运维面板：一打开，二十个绿色的勾，十几张折线图，右上角一个小红点。

你得自己扫一遍，才知道那个红点是什么，跟你有没有关系。

这样的面板展示了很多信息，代价是要你花注意力去筛。[01 设计哲学](./01-philosophy) 说 agent 要少占用人的注意力，这条原则对面板同样适用：**人打开面板，最想知道的是有没有自己要做的事。**

本章接着 [03](./03-request-lifecycle) 的场景。周一早上，你打开面板。周末 `alice` 在 Issue #42 请 agent 修了结算页的浮点金额，PR 已经开好，Ticket 停在 **Awaiting review**。除此之外一切正常。

我们看面板怎样只把这一件事摆在你面前。

正文里的源码摘自 commit `8c32a9d`，行号与上游一致。**英文注释是上游原有的，中文注释是本教程加的。** `// …` 表示省略的行。

## 1. 三个问题 {#three-questions}

> **问题：** 面板上哪些东西该有，哪些不该有，用什么来判断？

上游给了三个问题，按顺序排列（<Doc page="005-panel" anchor="three-questions">005 · 三个问题</Doc>）：

1. 现在有没有需要我处理的事？
2. 系统健康吗，在做对的事吗？
3. 某一项工作从 Trigger 经过 Eval 到 Ticket，历史是什么？

判断标准是：**每个元素都要回答其中一个问题，否则删掉。** 一个数字只有在会改变运维者行为时才出现。

Overview 页的数据由 `overview()` 一次算出。它的返回值就是前两个问题的答案：

```ts:no-line-numbers
// src/app/views/overview.ts
export function overview(host: ViewHost, health: HealthMap, policyVersionValue: string, load: ExecutorLoad, setup?: SetupProblem) {
  const { store, sources } = host
  // …
  // problems 回答问题 2 的"健康吗"。每一项都是"现在有问题"才出现，健康的部分不进列表
  const problems = [
    // 初始化没完成：排在最前面，Overview 先告诉你缺什么
    ...(setup ? [{ kind: 'setup' as const, ...setup }] : []),
    ...(running.length ? [] : [{ kind: 'no-source' as const }]),
    // Only allowed senders can originate work, so empty allowlists mean no request can ever become a ticket.
    ...(anyoneAllowed(settings) ? [] : [{ kind: 'no-allowed' as const }]),
    ...running.flatMap(source => source.health.filter(item => item.state === 'error').map(item => ({ kind: 'source-error' as const, source: { id: source.id, title: source.title, health: item } }))),
    ...(settings.paused ? [{ kind: 'executor-paused' as const }] : []),
    // Unavailable Evals behind the `evals` health entry are listed individually as `eval-unavailable` below.
    // evals 这一项健康状态不单独显示，下面逐个列出未完成的 Eval：一条笼统的报错换成几条能点进去处理的
    ...Object.entries(health).filter(([name, item]) => item.state === 'error' && !sourceParts.has(name) && !name.startsWith('sync:')
      && name !== 'evals')
      .map(([name, item]) => ({ kind: 'runtime-error' as const, name, detail: item.detail })),
    ...evaluating.filter(thread => thread.evaluating!.deadline < now)
      .map(thread => ({ kind: 'eval-overdue' as const, thread: threadSummary(view, thread) })),
    // …未完成的 Eval（eval-unavailable）和发送失败的回复（outgoing）
  ]
  const open = store.tickets.open().sort(newestFirst)
  // …
  return {
    problems,
    // person 回答问题 1：所有阶段是 person 的打开 Ticket。阶段由 ticketStage() 决定，见 03 第 8 步
    person: open.filter(ticket => ticketStage(ticket).stage === 'person').map(ticket => ticketRow(view, ticket)),
    executor: { ...load, maxWorkers: settings.executor.maxWorkers, idle: open.filter(ticket => ticketStage(ticket).stage === 'idle').length },
    flow: { received, filtered, triggers: received - filtered, judged: judgement.judged, accepted: judgement.accepted,
      evaluating: evaluating.length, dropped: store.read.droppedSince(since) },
    policyVersion: policyVersionValue,
  }
}
```

<Src path="src/app/views/overview.ts" lines="38-79" label="views/overview.ts · overview()" />

`person` 这一行把问题 1 落成了一个可检查的定义：Ticket 打开着，并且 `ticketStage()` 说它在等人。[03 · 第 8 步](./03-request-lifecycle#step-8-report) 里那张阶段表的五种 `person` 状态，就是"需要你"的全部情况：输入未送达、待回答、待验收、受阻、失败。没有第六种。

`#42` 的 Ticket 报告了 ready，阶段是 `person/review`，所以它在这个列表里。

问题 3 不在 Overview 上回答。它由 Trigger、Eval、Execution 三个页面和顶部的搜索负责。下一节看页面怎么分。

## 2. 标签页 {#tabs}

> **问题：** 一个 Ticket 的信息散在 Source、Trigger、Eval、Execution 好几处，为什么不做一个"万能详情页"？

你在 GitHub 上找一个 bug 的来龙去脉，往往要在 Issue、PR、Actions 之间来回跳。每跳一次，你都得重新确认自己在看哪一层。

面板的做法是让标签页顺着工作流排：`TABS = ['overview', 'source', 'trigger', 'eval', 'execution', 'settings']`（<Src path="src/client/route.ts" lines="7-8" label="client/route.ts · TABS" />）。从左往右读，就是一条请求走过的路：从哪来、收到了什么、怎么判的、谁在做。

每个概念只住在一个标签页里（<Doc page="005-panel" anchor="principles">005 · 原则 3</Doc>）。Source 的状态只在 Source 页，Decision 只在 Eval 页，Ticket 只在 Execution 页。Overview 只做汇总，然后链接过去。

各页打开时的默认过滤也值得看一眼。`Pages` 里写的是：Trigger 页默认 `subscribed`，Eval 页默认 `work`，Execution 页默认 `open`（<Src path="src/client/app.tsx" lines="141-170" label="client/app.tsx · Pages()" />）。

这三个默认值都指向"还在进行、可能和你有关"的那部分。大量 `ignore` 的 Decision 和已结束的 Ticket 要你主动切过滤才看得到。

Execution 页的过滤项 `TICKET_FILTERS = ['open', 'person', 'working', 'idle', 'ended']`（<Src path="src/app/api.ts" lines="12-12" label="app/api.ts · TICKET_FILTERS" />）除了 `open` 以外，正好是 `ticketStage()` 的四种 stage。面板没有另造一套分类，直接用了领域里已经定义好的阶段。这就是原则 2 "精确的定义"：分类互不重叠，覆盖所有情况。

接下来看 Overview 本身：当一切正常时，它会剩下什么。

## 3. 健康状态不占空间 {#quiet}

> **问题：** 系统正常时，面板上应该显示什么？一次网络抖动该不该报？

回到周一早上。GitHub 轮询一直正常，执行器没有暂停，没有发不出去的回复。

你打开 Overview，会看到四个区块里的三个：待处理工单、过去 24 小时、执行器。"系统问题"这一块整个不出现。

```ts:no-line-numbers
// src/client/overview.tsx
export function OverviewPage() {
  // …
  return <>
    {error && <LoadState error={error} loading={false} />}
    // 待处理工单总在第一位。没有时留一句话，让你知道"空"是查过的结果
    <Section title={t('pendingTickets')} count={data.person.length}>
      {data.person.length ? <ul className="dt-list dt-cards">{data.person.map(ticket => <TicketLine key={ticket.id} ticket={ticket} question
        onChanged={reload} />)}</ul>
        : <Hint>{t('needsYouNone')}</Hint>}
    </Section>
    // 系统问题：列表为空时整个区块不渲染，连标题都没有
    {data.problems.length > 0 && <Section title={t('problems')} count={data.problems.length}>
      <ul className="dt-list dt-cards">{data.problems.map((problem, index) => <ProblemLine key={index} problem={problem}
        onChanged={reload} />)}</ul>
    </Section>}
    <Section title={t('lastDay')} action={more({ page: 'trigger', query: { filter: 'recent' } })}>
      {/* Received and evaluated counts operate on Triggers rather than Threads or Decisions, so they do not link to filtered views. */}
      <div className="dt-stats">
        {stat(t('flowReceivedLabel'), data.flow.received)}
        // 被过滤为 0 时数字照样显示，但不给链接：点进去也没东西可看
        {stat(t('flowFilteredLabel'), data.flow.filtered, data.flow.filtered ? { page: 'source' } : undefined)}
        {stat(t('flowJudgedLabel'), data.flow.judged)}
        {stat(t('flowAcceptedLabel'), data.flow.accepted, { page: 'eval', query: { window: '24h' } })}
        // "放弃发送"只在大于 0 时出现。它是坏消息，平时不该占位置
        {data.flow.dropped > 0 && stat(t('flowDroppedLabel'), data.flow.dropped, { page: 'source' })}
      </div>
    </Section>
    <Section title={t('term.executor')} action={more({ page: 'execution' })}>
      {/* Pauses surface in `problems` above, so Executor counts render the same in both states; while setup waits, nothing runs. */}
      {setup?.problem ? <Hint>{t('executorWaitingSetup')}</Hint> : <div className="dt-stats">
        {stat(t('executingLabel'), `${data.executor.running} / ${data.executor.maxWorkers}`)}
        {stat(t('queuedLabel'), data.executor.queued)}
        {stat(t('idleLabel'), data.executor.idle)}
      </div>}
    </Section>
  </>
}
```

<Src path="src/client/overview.tsx" lines="61-103" label="client/overview.tsx · OverviewPage()" />

这段代码里有两种"空"的处理，值得分开看。

**待处理工单为空时，留一句"没有待处理的工单。"** 这是问题 1 的答案。答案是"没有"也要说出来，否则你分不清是没有，还是没加载出来。

**系统问题为空时，整个区块消失。** 健康是默认状态，不需要一张"一切正常"的卡片来证明。

两者处理不同，推测原因是：问题 1 每次打开都要回答，问题 2 只在出事时才需要你。

执行器那一块的英文注释也在讲同一件事。执行器暂停时，"已暂停"已经作为一条系统问题出现在上面，下面的计数就不再重复标注一遍。同一件事只说一次。

### Source 页：只列出不正常的部分

Overview 是汇总，Source 页是 Source 状态唯一的家。这里的每一行也是"健康的部分不显示"：

```ts:no-line-numbers
// src/client/source.tsx
function SourceRow({ source }: { source: SourceStatusRow }) {
  // …
  const { received, filtered, lastAt } = source.stats
  // Omit healthy parts and suppress per-part notes when a setup problem already explains why the Source is stopped.
  // 只挑 error 和 paused 的部分写说明。设置问题已经解释了停下的原因时，各部分的说明全部省掉
  const notes = source.enabled && !problem && !setup?.problem ? source.health.filter(item => item.state === 'error'
    || item.state === 'paused') : []
  return <li className="dt-row">
    // …
      <div className="dt-row-meta">
        // 计数为 0 的标签不渲染：一行"到达 0 · 被过滤 0"没有信息
        {received > 0 && <LabelValue label={t('sourceReceivedLabel')}
          value={received} />}{filtered > 0 && <LabelValue label={t('sourceFilteredLabel')} value={filtered} />}
        {lastAt && <LabelValue label={t('sourceLatestLabel')} value={when(lastAt, t('lang'))} />}
      </div>
      // …
      // 被过滤的触发和放弃发送的消息，有才出现，并且默认折叠
      {source.filtered.length > 0 && <DisclosureRow icon={<Icon name="filter" />} title={t('sourceFilteredTitle')} open={filteredOpen}
        onToggle={() => setFilteredOpen(!filteredOpen)}>
      // …
      </DisclosureRow>}
      {dropped.length > 0 && <DroppedReplies items={dropped} />}
    </div>
  </li>
}
```

<Src path="src/client/source.tsx" lines="95-139" label="client/source.tsx · SourceRow()" />

一个正常运行的 GitHub Source，最后只剩一行：名字、状态"就绪"、到达数、最近一次时间。

注意 `notes` 的条件。初始化没完成时，所有 Source 都停着，每个部分都会是 paused。如果逐条列出，你会看到一串说明，讲的其实是同一个原因。代码只保留最上层的那条设置问题。

### 一次网络抖动不算问题

"默认安静"还有后半句：问题必须是你能处理的，一次偶发的网络错误不够格（<Doc page="005-panel" anchor="principles">005 · 原则 6</Doc>）。

这句话落在 GitHub Source 的轮询循环里：

```ts:no-line-numbers
// src/sources/github.ts
/** Returns an error health once `failures` consecutive polls fail, or undefined so a single network interruption stays quiet. */
export function pollFailure(failures: number, threshold: number, error: unknown): Health | undefined {
  return failures >= threshold ? health('error', 'pollFailures', { count: String(failures), error: String(error) }) : undefined
}
async function watch(ctx: SourceContext, signal: AbortSignal): Promise<void> {
  let interval = 60
  let failures = 0
  // …
  while (!signal.aborted) {
    const config = ctx.config<GithubConfig>(SOURCE)
    try {
      if (config) interval = await pollRound(ctx, signal)
      else ctx.report('github', health('paused', 'sourceOff'))
      // 成功一次就清零。只有"连续"失败才累计
      failures = 0
    } catch (error) {
      failures += 1
      // 阈值来自设置 failuresBeforeError，默认 3。没到阈值时 failed 是 undefined，什么都不报
      const failed = pollFailure(failures, config?.failuresBeforeError ?? 1, error)
      if (!signal.aborted && failed) ctx.report('github', failed)
    }
    await pause(Math.max(interval, ctx.config<GithubConfig>(SOURCE)?.pollSeconds ?? 60) * 1000, signal)
  }
}
```

<Src path="src/sources/github.ts" lines="123-146" label="sources/github.ts · pollFailure() / watch()" />

`failuresBeforeError` 在配置 schema 里是 `.default(3)`，范围 1 到 20（<Src path="src/sources/github.ts" lines="26-27" label="GithubConfigSchema" />）。它在设置页的说明写得很直接："单次网络中断会在下一次轮询时自动重试，不必报告。"（<Src path="src/sources/github.ts" lines="49-49" label="github.ts · 设置说明" />）

按默认 60 秒轮询，GitHub 要连续失败约三分钟，Overview 上才会出现一条"来源异常"。

Effects 队列用的是同一个阈值：`FAILURES_BEFORE_ERROR = 3`，注释说它"matching the Sources poll failure threshold"（<Src path="src/app/effects.ts" lines="6-7" label="app/effects.ts · FAILURES_BEFORE_ERROR" />）。重试本身怎么做，见 [06 · 重试与退避](./06-reliability#retry)。

有一处例外要留意。Overview 的 `outgoing` 问题来自 `store.read.failingReplies()`，它的条件是 `e.attempts > 0`（<Src path="src/app/store-read.ts" lines="69-72" label="store-read.ts · failingReplies" />）。也就是说，一条回复失败一次，Overview 就会多一行"回复发送失败（已重试 1 次）"，并不等到第三次。

上游文档没有解释这一点。推测原因是：发不出去的回复是 agent 对团队说的话，晚到也会影响人，所以早一点让你看见。不过这一行没有操作按钮，你能做的只有等它自动重试。读到原则 6 时可以拿它对照一下。

下一节换个角度看 Overview 上的数字：你点进去之后，看到的东西对不对得上。

## 4. 计数等于列表长度 {#honest-counts}

> **问题：** Overview 写着"接单或续做 3"，点进去应该看到几条？

你可能遇到过这种面板：首页写着"12 个告警"，点进去列表里只有 9 条。剩下 3 条去哪了？过期了？被合并了？还是首页数字算错了？

从这一刻起，你就不太敢信首页上的任何数字了。

上游原则 5 说："计数等于它所链接列表的长度，任何状态都不与其他事实矛盾"（<Doc page="005-panel" anchor="principles">005 · 原则 5</Doc>）。做到这一点的办法很朴素：**数字和列表用同一个条件查。**

先看"接单或续做"。Overview 上的数字来自 `flow()`，点进去是 Eval 页 `work` 过滤加 24 小时窗口，查的是 `decisions()`：

```ts:no-line-numbers
// src/app/store-read.ts:18
  /**
   * Counts triggers arriving at or after `since` that passed source filtering and reached a decision,
   * and how many accept/reopen decisions those same arrivals produced.
   */
  flow: (since: string): { judged: number; accepted: number } => {
    const passed = "t.at >= ? AND NOT EXISTS (SELECT 1 FROM disposition s WHERE s.id = t.id AND json_extract(s.value, '$.filtered') IS NOT NULL)"
    const judged = db.prepare(`SELECT COUNT(DISTINCT t.id) AS n FROM decision d, json_each(json_extract(d.value, '$.triggerIds')) j JOIN trigger t ON t.id = j.value WHERE ${passed}`).get(since)
    // accepted：数的是 Decision（DISTINCT d.id），种类 accept/reopen，至少有一个 Trigger 在窗口内
    const accepted = db.prepare(`SELECT COUNT(DISTINCT d.id) AS n FROM decision d, json_each(json_extract(d.value, '$.triggerIds')) j JOIN trigger t ON t.id = j.value WHERE json_extract(d.value, '$.kind') IN ('accept', 'reopen') AND t.at >= ?`).get(since)
    return { judged: Number(judged?.n ?? 0), accepted: Number(accepted?.n ?? 0) }
  },
  // …
  /** Decisions matching `kinds` whose triggers arrived at or after `since`, aligned with `flow` window counts. */
  // 列表这边：同样按 kind 过滤，同样用"有一个 Trigger 在 since 之后"的 EXISTS 条件。注释直接写了要和 flow 对齐
  decisions: (options: { kinds: string[]; since: string }, offset: number, limit: number): { items: Decision[]; more: boolean } => {
    const where = [...(options.kinds.length ? [`json_extract(d.value, '$.kind') IN (${options.kinds.map(() => '?').join(',')})`] : []),
      ...(options.since ? ["EXISTS (SELECT 1 FROM json_each(json_extract(d.value, '$.triggerIds')) j JOIN trigger t ON t.id = j.value WHERE t.at >= ?)"] : [])]
    const rows = db.prepare(`SELECT d.value FROM decision d ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY d.rowid DESC LIMIT ? OFFSET ?`)
      .all(...options.kinds, ...(options.since ? [options.since] : []), limit + 1, offset)
    return { items: rows.slice(0, limit).map(row => JSON.parse(String(row.value)) as Decision), more: rows.length > limit }
  },
```

<Src path="src/app/store-read.ts" lines="18-66" label="store-read.ts · flow() / decisions()" />

两边要对上，还得几个参数一致。我逐个查了：

- Eval 页的 `work` 过滤对应 `DECISION_KINDS.work = 'accept,reopen'`（<Src path="src/client/api.ts" lines="100-102" label="client/api.ts · DECISION_KINDS" />），和 `flow()` 里的 `IN ('accept', 'reopen')` 相同。
- 列表接口带 `window` 时，`since` 取 `Date.now() - 86_400_000`（<Src path="src/app/http.ts" lines="182-186" label="app/http.ts · GET decisions" />）。Overview 用 `dayAgo()`，里面的 `DAY` 也是 `86_400_000`（<Src path="src/app/views/records.ts" lines="15-16" label="records.ts · dayAgo" />）。
- 两边都按 Decision 计，一个 Decision 只算一次。

再看"放弃发送"。这个数字点进去是 Source 页底部的折叠列表，`droppedReplies()` 的英文注释把目的写得很清楚：

```ts:no-line-numbers
// src/app/views/sources.ts
/** Replies dropped in the last 24 hours, enriched with their associated ticket and thread. */
export function droppedReplies({ store, links }: Pick<ViewHost, 'store' | 'links'>) {
  // Fetch the exact 24-hour dropped count so this list's length matches the overview's `dropped` metric.
  // droppedReplies 默认只取 20 条。这里先数出 24 小时内的确切条数，再按这个数取，列表就不会被截短
  return store.read.droppedReplies(store.read.droppedSince(dayAgo())).map(item => {
    const ticket = item.ticketId ? store.tickets.get(item.ticketId) : undefined
    const { triggerId } = links(item.channel)
    const home = triggerId ? store.triggers.get(triggerId)?.threads[0] : undefined
    const thread = home ? threadKey(home) : store.threads.get(item.channel.thread) ? item.channel.thread : undefined
    return { id: item.id, kind: item.kind, channel: item.channel, preview: preview(item.text), dropped: item.dropped,
      ...ticket ? { ticket: { id: ticket.id, title: ticket.title } } : {}, ...thread ? { thread } : {} }
  })
}
```

<Src path="src/app/views/sources.ts" lines="59-70" label="views/sources.ts · droppedReplies()" />

`store.read.droppedReplies(limit = 20)` 本来有 20 条的上限（<Src path="src/app/store-read.ts" lines="73-75" label="store-read.ts · droppedReplies / droppedSince" />）。如果直接用默认值，某天放弃了 25 条，Overview 写 25，Source 页只列 20。代码先用 `droppedSince` 数出确切条数，再把它当 limit 传进去，这个差就没了。

剩下几个数字也逐个对过：

| Overview 上的数字 | 点进去 | 是否一致 | 依据 |
| --- | --- | --- | --- |
| 待处理工单 | 列表就在本区块 | 一致 | `count={data.person.length}` |
| 系统问题 | 列表就在本区块 | 一致 | `count={data.problems.length}` |
| 接单或续做 | Eval · work · 24h | 一致 | 同 kind、同窗口、同 EXISTS 条件 |
| 放弃发送 | Source 页折叠列表 | 一致 | `droppedReplies` 的注释和 limit |
| 被过滤 | Source 页 | 与各 Source 的"被过滤"计数之和一致 | 见下文 |
| 到达、已评估 | 没有链接 | 不适用 | 代码注释说明 |

还有一个间接的对应：Overview 的 `person` 和 Execution 页"待处理"过滤用的是同一个谓词 `ticketStage(ticket).stage === stage`（<Src path="src/app/views/tickets.ts" lines="35-42" label="views/tickets.ts · ticketList()" />）。两处都只看打开的 Ticket，所以数目相同。

"被过滤"需要多说一句。它链接到 Source 页，那里每个 Source 一行，各自显示"被过滤 N"，加起来等于 Overview 的数字。但 Source 页那个折叠列表的标题是"24 小时内最近被过滤的触发"，代码只取最近 5 条（`store.read.triggers({ source, filtered: true }, 0, 5)`，<Src path="src/app/views/sources.ts" lines="46-48" label="sourcesStatus · filtered" />）。

所以，如果你把 Overview 的"被过滤 12"和那个列表的条数比，会对不上。标题里的"最近"已经把这一点说出来了，算不上矛盾，但它是这一组数字里唯一不能"一个一个数"的。

"到达"和"已评估"没有链接，原因写在 `OverviewPage` 的英文注释里：这两个数按 Trigger 计，而各个列表页列的是 Thread 或 Decision。没有一个列表的长度等于它，那就干脆不给链接。

**宁可不链接，也不链接到一个数不上的列表。** 这是原则 5 在代码里最直接的样子。

接下来看设置页。那里的问题不在数字对不对，而在于什么时候该出现一个按钮。

## 5. 设置分组 {#settings}

> **问题：** 想改"接单模式"，你会先去哪里找？

很多软件的设置页按"技术层"分：网络、存储、高级。你得先知道某个选项在实现上属于哪一层，才找得到它。

面板的设置按它配置的**概念**分：`SETTINGS_GROUPS = ['source', 'eval', 'execution', 'prompts', 'deployment']`（<Src path="src/client/route.ts" lines="9-9" label="client/route.ts · SETTINGS_GROUPS" />）。

前三组和标签页同名，也和一条请求走过的阶段同名。`SettingsPage` 给这三组单独打了 `data-stage` 标记（`STAGE_GROUPS = ['source', 'eval', 'execution']`，<Src path="src/client/settings.tsx" lines="12-38" label="client/settings.tsx · SettingsPage()" />）。你在 Eval 页看到一个判断不合心意，就去"设置 · 评估"改。接单模式、允许名单、准入表都在那里（<Doc page="005-panel" anchor="settings-groups">005 · 设置分组</Doc>）。

后两组不对应流程阶段。Prompts 放团队写的文字，细节见 [07 · 团队可写的三段](./07-prompts#team-sections) 和 [07 · Default updated](./07-prompts#default-updated)。Deployment 放启动检查和资源上限。

设置页也遵守"默认安静"。最明显的是保存栏：

```ts:no-line-numbers
// src/client/draft.tsx
/** Sticky save/discard bar for a settings block; transfers focus back to its parent block when hidden so keyboard navigation does not reset. */
export function SaveBar({ state, dirty, busy, words, status, onDiscard, onSave }: {
  state: DraftState<unknown, unknown>; dirty: boolean; busy: boolean; words?: DraftWords; status?: string | undefined
  onDiscard: () => void; onSave?: () => void
}) {
  const { t } = usePanel()
  const line = saveBarText(t, state, words)
  // 三种情况之一才显示：有未保存的改动、正在保存、上次保存失败
  const shown = dirty || busy || !!line.error
  const bar = useRef<HTMLDivElement>(null)
  const block = useRef<HTMLElement | null>(null)
  const focused = useRef(false)
  useLayoutEffect(() => {
    if (shown) { block.current = bar.current?.parentElement ?? null; return }
    // 保存栏消失时，焦点如果还在栏里，就交还给所在的设置块，键盘用户不会被甩回页首
    const lost = !document.activeElement || document.activeElement === document.body
    if (focused.current && block.current && lost) { block.current.tabIndex = -1; block.current.focus({ preventScroll: true }) }
    focused.current = false
  }, [shown])
  // 什么都没改的时候，页面上没有一个灰掉的"保存"按钮
  if (!shown) return null
  // …
}
```

<Src path="src/client/draft.tsx" lines="175-201" label="client/draft.tsx · SaveBar()" />

一个设置块只有一个保存栏，平时不出现（<Doc page="005-panel" anchor="principles">005 · 原则 7</Doc>）。你随手点开设置看一眼，不会被一排"保存 / 取消"按钮提醒"你是不是该做点什么"。

每组设置还带着自己的保存历史（`ConfigHistory`，<Src path="src/client/settings-kit.tsx" lines="119-131" label="settings-kit.tsx · ConfigHistory" />），默认折叠。Policy 改了什么、哪天改的，需要时展开看。Policy 版本本身的意义见 [04 · Policy 版本](./04-authorization#policy-version)。

设置是你主动去找的东西。下一节的搜索也是：你手里有一个线索，想直接跳到对应的记录。

## 6. 搜索 {#search}

> **问题：** 同事在群里贴了一个 PR 链接问"这个是 agent 开的吗"，你怎么最快找到它的 Ticket？

你手里只有一个 URL。按标签页一页页翻，要先猜它在哪个阶段。

页头的搜索框接受的正是这种"手里现成的东西"：一段文字、一个 id、`#42`、一个 GitHub URL，或者一条飞书消息链接。

```ts:no-line-numbers
// src/app/views/threads.ts
/**
 * Searches triggers, threads, and tickets by text, ID, source-extracted references (e.g., `#N`, URLs), or cached Feishu AppLinks.
 * @param links - Feishu message AppLinks cached since startup, keyed by chat and message ID.
 */
export function search(host: ViewHost, query: string, links: Pick<TextCache, 'entries'>) {
  const { store, sources } = host
  const value = query.trim()
  if (!value) return { tickets: [], items: [], threads: [] }
  const view = snapshot(host)
  // 由各个 Source 解析输入：GitHub 认得 #42 和 URL，返回对应的 Thread 和检索词
  const named = sources.find(value)
  const terms = new Set([value, ...named.terms])
  // 飞书链接只有在本进程读到过时才在缓存里，所以重启后可能搜不到
  for (const [name, url] of links.entries()) if (url === value) terms.add(name.split(':').at(-1)!)
  const found = new Map<string, Trigger>()
  for (const term of terms) for (const trigger of store.read.search(term)) found.set(trigger.id, trigger)
  // …
  // Match tickets by threads they own (e.g., bound PRs) or subscribe to, as well as by title.
  // PR 链接能找到 Ticket，靠的是 Ticket 跟踪着这个 PR 的 Thread
  const reaches = (ticket: Ticket) => [...(ticket.follows ?? []).map(follow => follow.thread),
    ...view.threadsOf(ticket.id).map(thread => thread.key)]
  const matches = (ticket: Ticket) => reaches(ticket).some(key => named.threads.includes(key)) || ticket.title.toLowerCase().includes(lower)
  const tickets = store.tickets.list().filter(matches).sort(newestFirst).slice(0, 10).map(ticketSummary)
  // Omit automated triggers from threads already included in `threads`.
  // 已经列出整个 Thread 时，不再把里面的机器人消息、CI 结果逐条列一遍
  const shownThreads = new Set(threads.map(thread => thread.key))
  // …
  const items = [...found.values()].filter(trigger => trigger.human || !shownThreads.has(threadKey(trigger.threads[0]!)))
  return { tickets, items: items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map(item), threads }
}
```

<Src path="src/app/views/threads.ts" lines="55-88" label="views/threads.ts · search()" />

回到同事贴的 PR 链接。GitHub Source 把 URL 解析成 PR 的 Thread。#42 的 Ticket 跟踪着这个 PR，于是出现在结果的第一组。点一下就进了 Ticket 详情。

结果有上限：Ticket 最多 10 个，Trigger 最多 20 条。Trigger 达到 20 条时，结果头会写"前 20 条触发（请缩小搜索范围）"（`searchFoundCapped`，<Src path="src/client/app.tsx" lines="68-78" label="client/app.tsx · SearchResults()" />）。

这和上一节的计数原则是同一个思路：列表被截断了，就明说。

被 Source 过滤掉的 Trigger 也能搜到，但它没有 Thread 可去，结果里显示过滤原因，不给链接。搜索结果的每一行，要么能点进一个真实存在的页面，要么告诉你为什么不能。

下面把前面几节放在一起看：注意力预算落到 UI 上，变成了哪些具体的规则。

## 7. 把注意力预算用到 UI 上 {#principles}

> **问题：** "少占用人的注意力"听起来像口号。写面板代码时，它到底约束了什么？

[01 设计哲学](./01-philosophy) 里那句话是：项目的每个部分都按它消耗的注意力来评判，面板元素也在其中（<Doc page="000-philosophy" anchor="what-follows-for-the-design">000 · 对设计的要求</Doc>）。

上游把它展开成七条原则（<Doc page="005-panel" anchor="principles">005 · 原则</Doc>）。这里不再复述，只把本章看过的代码对回去：

| 原则 | 代码里的样子 | 出处 |
| --- | --- | --- |
| 1 聚焦重要的事 | 第一个区块是 `person`，第二个是 `problems` | `OverviewPage` |
| 2 精确的定义 | 过滤项直接用 `ticketStage()` 的 stage；状态标签写"待验收"这种人话 | `TICKET_FILTERS`、`ticketMark` |
| 3 每个概念只放一处 | 暂停只在系统问题里说一次，执行器计数不重复标注 | `OverviewPage` 英文注释 |
| 5 诚实的状态 | 数字和列表同一条件；数不上就不链接 | `flow` / `decisions`、`droppedReplies` |
| 6 默认安静 | 空的问题区块不渲染；计数为 0 不显示；连续失败 3 次才报 | `SourceRow`、`pollFailure` |
| 6 可以处理 | 每种系统问题都带去处或按钮，例如"恢复处理""重新评估" | `ProblemLine` |
| 7 一致的控件 | 保存栏只在改动、保存中、失败时出现 | `SaveBar` |

原则 6 还有一句"需要人处理的行直接提供对应操作"。看 Overview 上 #42 那一行，`TicketLine` 根据阶段决定给什么按钮（<Src path="src/client/rows.tsx" lines="10-44" label="client/rows.tsx · TicketLine()" />）：

- 待回答时给"去 GitHub 回答"的链接，因为回答要在原来的对话里进行。
- 可以重试时给"重试"，可以停止时给"停止"。两者都是 `ConfirmButton`，要先确认。"重试"的确认文字写明"授权和订阅不变"。

#42 是待验收，状态图标是 `review`，颜色是 `warning`（<Src path="src/client/marks.ts" lines="9-23" label="client/marks.ts · ticketMark()" />）。验收要去 GitHub 看 PR，所以这一行没有"回答"链接，也没有"重试"（`canRetry` 只对受阻、失败或输入未送达的 Ticket 成立，<Src path="src/core/stage.ts" lines="24-26" label="core/stage.ts · canRetry()" />）。打开的 Ticket 都带一个"停止"按钮。

整页加起来，你周一早上看到的是：一张琥珀色卡片写着"待验收"，下面几个数字，没有红色。

这是这块面板想要的常态。下一节拿它和你熟悉的面板比一比。

## 8. 和常见运维面板的区别 {#comparison}

> **问题：** 你以前用的监控面板，哪些习惯在这里被刻意去掉了？

| 常见做法 | 这块面板 | 原因 |
| --- | --- | --- |
| 每个组件一个绿勾 | 健康的部分不显示 | 绿勾不改变你的行动 |
| 每次失败都告警 | 连续 3 次才报（回复发送除外） | 一次抖动会自己恢复 |
| 首页数字是"大约" | 数字等于点进去的列表长度 | 对不上一次，以后就不信了 |
| 一个详情页什么都放 | 每个概念一个家，Overview 只汇总 | 你总知道自己在看哪一层 |
| 设置按技术层分 | 按 Source、Eval、Execution 分 | 和你看到问题的页面同名 |
| 常驻的保存按钮 | 有改动才出现 | 没事的时候不提示你做事 |
| 内部状态码 | "待验收""输入未送达" | 标签说的是在等谁、要什么 |

右边这一列并不新鲜。不少好用的工具都这么做。这里值得学的是它们都能在代码里找到对应的一行：`&&` 条件渲染，`>= threshold`，同一个 SQL 条件，`if (!shown) return null`。

如果你要给自己的 agent 做面板，最省事的起点也许就是这张表的右列。

## 回顾 {#recap}

回到开头的四个问题。

1. **第一屏回答什么？** 先回答"有没有需要我处理的事"：所有 stage 为 `person` 的打开 Ticket。没有时显示"没有待处理的工单。"。一切正常时，"系统问题"区块整个不出现，页面只剩这一句话和几个数字。
2. **健康状态怎样被隐藏？** 靠条件渲染：`problems.length > 0 &&`、`received > 0 &&`、`dropped > 0 &&`，Source 行只给 error 和 paused 的部分写说明。网络抖动靠 `pollFailure()` 的阈值挡住，默认连续 3 次失败才报。例外是发送失败的回复，失败 1 次就会出现在系统问题里。
3. **数字和列表对得上吗？** 对得上，因为两边用同一个查询条件，`droppedReplies` 还专门按确切条数取。"被过滤"对应的是各 Source 计数之和，折叠列表只列最近 5 条。"到达"和"已评估"按 Trigger 计，没有对应的列表，所以故意不给链接。
4. **注意力预算变成了什么规则？** 每个元素回答三个问题之一；分类直接用领域阶段；每个概念一个家；数不上就不链接；没事就不显示；能处理的问题直接给按钮，破坏性操作要确认。

面板是运维者看系统的窗口。下一章 [09 代码架构](./09-architecture) 换到代码内部，看 Engine 和端口怎样划分。

## 思考题 {#exercises}

1. 如果在 Overview 加一个"今日 Token 用量"卡片，它回答了三个问题中的哪一个？它会改变你的什么行动？按上游原则应不应该加？如果你觉得应该，放在哪个标签页更合适？
2. `failingReplies` 用的是 `attempts > 0`，Source 轮询要连续失败 3 次。试着为两种做法各找一个理由。如果把回复也改成 3 次才显示，有人会因此错过什么？
3. 假设要在 Overview 加一个"本周关闭的 Ticket"数字，并链接到 Execution 页 `ended` 过滤。`ticketList` 的 `ended` 列出的是全部已结束的 Ticket，没有时间窗口。要让计数等于列表长度，你需要改哪几处？
4. "被过滤"的折叠列表只取最近 5 条。如果要让它和计数完全一致，代价是什么？你会这样改吗？

