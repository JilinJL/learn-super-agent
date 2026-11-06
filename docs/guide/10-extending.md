# 10 扩展：新增一个 Source

::: info 本章
**前置：** [09 代码架构](./09-architecture)（端口与依赖规则）、[03 一个请求的一生](./03-request-lifecycle)（Trigger 从哪来、到哪去）
**对应上游：** <Doc page="008-cookbook" anchor="add-a-source">008 · Add a Source</Doc>，以及 <Doc page="007-architecture" anchor="sources">007 · Sources</Doc>
**对应源码：** <Src path="src/sources/kind.ts" />、<Src path="src/app/source-context.ts" />、<Src path="src/sources/github.ts" />、<Src path="src/sources/feishu.ts" />、<Src path="src/app/execution-environment.ts" />
:::

::: tip 带着这些问题读
1. 接入一个新的事件源（比如 Slack、Linear、企业微信）需要实现哪些东西？最少几个文件？
2. `SourceKind` 里哪些字段是必选的，哪些可以省略？省略之后系统怎么退化？
3. 上游 Cookbook 的示例 `webhook` 在真实仓库里没有对应实现，怎么知道它写得对不对？
4. 一个 Source 最容易写错、而且错了还不容易发现的地方是什么？
:::

![一个机器人把一根从远处大楼接过来的新管道插进引擎侧面的空插座，管道里流着一封封信封。插座周围已经插着几根形状不同的管子，说明引擎只认形状不认来源](/images/new-source-plug.jpg)

这一章回答的是"我要接一个新的平台"该怎么动手。

上游 <Doc page="008-cookbook" anchor="add-a-source">008 Cookbook</Doc> 已经给了一份完整菜谱：一个假想的 `webhook` 来源，通过一个虚构的 CLI `hookq` 读一个想象中的消息队列，十一 步从零写到一个可注册的插件。本章跟着它走，但每一节多做三件事：

- 说清这一步**为什么**必要，回链到前面几章的机制；
- 给出 GitHub 或飞书 Source 里**真实的对应代码**，用来对账；
- 标出 Cookbook 没写、但代码里看得到的坑。

关于源码的约定：代码摘自 commit `8c32a9d`。**英文注释是上游原有的，中文注释是本教程加的。** `// …` 表示省略的行。

## 1. 先做映射，再写代码 {#map-first}

> **问题：** 为什么第一步不是建文件，而是画表？

Cookbook 的第 1 步要求先把事件映射到领域概念，然后才动键盘：

| 概念 | webhook 队列的对应物 |
| --- | --- |
| Trigger | 一条消息 |
| Thread | 一个会话里的一条消息和它的回复：`<conversation>:<第一条消息的 id>` |
| Actor | 发送者在队列上的 id，允许名单按它写 |
| Channel address | 回复发到哪个会话、哪条消息下面 |
| Receiving scope | 一个会话，在准入表里有自己的行 |

原因是这些 id 会被**持久化**。Cookbook 原话："Trigger ids, Thread ids and Channel addresses are persisted, so changing them later can disconnect existing records."

这句话的代价具体是什么：Trigger id 决定了去重（[03 第 2 步](./03-request-lifecycle#step-2-intake)），改了它，历史消息会全部变成新请求；Thread id 决定了订阅和关联，改了它，已有 Ticket 会丢失跟踪的对话；Channel address 决定了 Outbox 的回执和顺序，改了它，没发出去的消息会发到错地方。三者中任何一个都是"上线后无法修复"级别的。

所以映射表要先定稿。可以对照 [02 领域模型](./02-domain-model) 的十个概念逐一填：这个平台里"什么是一次请求""什么是一段对话""谁是人""怎么叫它"。

拿 GitHub 对账：Trigger 是一条评论、一个 Issue 正文、一次 review 或一次 CI 变化；Thread 是一个 Issue 或 PR（`github:<编号>`）；Channel address 是编号加可选的 review 讨论 id。拿飞书对账：Trigger 是一条消息（不管来自实时事件、历史补收还是话题页，都归一成同一个 id）；Thread 是 `chat_id:root_id`；address 是 `{chatId, messageId, direct}`。

飞书的 `direct` 字段值得单独看：群和私聊的 id 都以 `oc_` 开头，所以地址里必须显式记下这是不是私聊，否则 `allowed` 无法判断。Cookbook 举的正是这个例子："Put every required fact in the address; for example, Feishu records whether the chat is direct."

## 2. `SourceKind`：必选与可选 {#source-kind}

> **问题：** 一个 Source 最少要实现多少东西？省略一项会失去什么？

`SourceKind`（`src/sources/kind.ts`）是整个插件的契约。先看必选部分在真实代码里长什么样，这里取 GitHub kind 的开头：

```ts:no-line-numbers
// src/sources/github.ts:38
export const githubKind: SourceKind<GithubConfig> = {
  kind: SOURCE,
  title: { zh: 'GitHub', en: 'GitHub' },
  description: { zh: '智能体的 GitHub 账号；接收仓库里发给它的通知、已订阅 Issue 与 PR 的讨论、CI 状态变化和 PR 合并关闭。', en: 'The agent\'s GitHub accounts; receives notifications to it in the repository, discussion on subscribed Issues and PRs, CI changes, and PR merge or close.' },
  schema: GithubConfigSchema,
  fields: [
    { key: 'repository', type: 'text', pattern: '[A-Za-z0-9_.\\-]+/[A-Za-z0-9_.\\-]+', label: { zh: '监听的仓库', en: 'Repository' },
      hint: { zh: '写作 owner/name。这个来源接收这个仓库的通知和讨论；保存时检查智能体账号能否推送到它，然后重启 dsh-superagent。', en: 'Written owner/name. This Source receives the repository\'s notifications and discussion; saving checks that the agent account can push to it, then restarts dsh-superagent.' } },
    // …其余字段
  ],
```

<Src path="src/sources/github.ts" lines="38-62" label="github.ts · githubKind 必选部分" />

七个必选字段，每一个都有明确的下游消费者：

| 字段 | 谁用它 | 少了会怎样 |
| --- | --- | --- |
| `kind` | Trigger 的 `source`、Thread key 前缀、`sources.<kind>` 设置块、Policy 的 `sources.<kind>` | 无法注册 |
| `title`、`description` | 面板的来源列表 | 无法注册 |
| `schema` | `SourceRegistry.validate`、`resolve`、Settings 保存 | 无法注册。默认值必须"什么都不接收" |
| `fields` | 面板自动生成设置表单 | 无法注册。有了它就不必写面板代码 |
| `health` | `HealthBoard.claim` | 无法注册。注册时会拒绝与 `runtime`、`reply`、`worker` 或 effect kind 重名，`sync:` 前缀保留给 Policy 同步 |

可选能力才是这一章的重点。把 `SourceKind` 接口里的可选项和"省略后的退化"列成一张表，这张表就是本章剩余小节的地图：

| 可选能力 | 接口位置 | 省略后的行为 |
| --- | --- | --- |
| `facts(deployment)` | <Src path="src/sources/kind.ts" lines="91" /> | 设置页不显示"当前账号"这类只读状态 |
| `scope({meta}, config)` | <Src path="src/sources/kind.ts" lines="98" /> | 收到自己产生的每一条 Trigger，但一条都不"观察"（`observed: false`） |
| `channel` | <Src path="src/sources/kind.ts" lines="100" /> | 不能发任何回复。`SourceRegistry.send` 直接返回 `gone` |
| `threadContext` | <Src path="src/sources/kind.ts" lines="102" /> | 研判时读不到对话上下文，只能看到 Trigger 自己的正文 |
| `find(query)` | <Src path="src/sources/kind.ts" lines="104" /> | 全文搜索仍然可用，只是不认 `#12`、`om_xxx` 这类原生引用 |
| `repliesTo(trigger)` | <Src path="src/sources/kind.ts" lines="106" /> | 跟进通知和 worker Input 不显示"回复的是哪条" |
| `policy` | <Src path="src/sources/kind.ts" lines="108" /> | 这个 Source 的发送者没有自己的允许名单，`allowed` 无从配置 |
| `refreshLabels(host, signal)` | <Src path="src/sources/kind.ts" lines="110" /> | 设置表单里 `choose` 和 `refresh` 列没有可选项 |
| `environment` | <Src path="src/sources/kind.ts" lines="112" /> | 执行环境里没有这个 Source 的变量，worker 不知道自己在跟哪个平台打交道 |

退化行为不是猜的，`SourceRegistry`（`src/sources/registry.ts`）里逐条写着：

```ts:no-line-numbers
// src/sources/registry.ts:122
  scope(input: { source: string; meta: Record<string, unknown> }, settings = this.settings()): ScopeResult {
    const kind = this.kinds.get(input.source)
    const stored = settings.sources[input.source]
    // Without its kind plugin the stored scope cannot be evaluated, so a configured Source whose plugin is missing listens to nothing.
    if (!kind) return stored ? { listened: false, reason: 'source_not_installed' } : { listened: true, observed: false }
    const instance = this.resolve(kind, stored)
    if (!instance.enabled) return { listened: false, reason: 'source_disabled' }
    return kind.scope ? kind.scope({ meta: input.meta }, instance.config) : { listened: true, observed: false }
  }
```

<Src path="src/sources/registry.ts" lines="122-130" label="registry.ts · SourceRegistry.scope()" />

最后一行就是"没有 `scope` 的 kind 会怎样"的权威答案：`listened: true, observed: false`。注意第二、三行：插件没加载时返回 `source_not_installed`，实例被关掉时返回 `source_disabled`——这两个原因码会写进 Trigger 的 disposition，面板上能看到"为什么没反应"。

还有一个 `send` 的退化路径：

```ts:no-line-numbers
// src/sources/registry.ts:94
  async send(message: OutboundMessage, commands: Commands): Promise<'sent' | 'gone' | 'waiting'> {
    const kind = this.kinds.get(message.channel.source)
    if (!kind) return 'waiting'
    return kind.channel ? kind.channel.send({ commands }, message) : 'gone'
  }
```

<Src path="src/sources/registry.ts" lines="92-97" label="registry.ts · SourceRegistry.send()" />

三种返回值，对应三种状态：kind 没装 → `waiting`，消息继续等（Outbox 抛 `Later`，稍后重试）；kind 装了但没有 `channel` → `gone`，消息记为 `channelGone` 并永久放弃。所以"省略 `channel`"等于"所有回复都会丢失"，只适合纯输入型 Source。

## 3. 翻译：把一条消息变成一个 Trigger {#translate}

> **问题：** 一个 Source 最核心的一个函数是什么？它要保证什么？

Cookbook 第 3 步给出的 `webhookTrigger` 是整章最重要的一段代码：

```ts:no-line-numbers
// docs/008-cookbook.md:100
export function webhookTrigger(message: QueueMessage, me: string): Trigger | undefined {
  if (message.sender.id === me) return undefined
  const thread = `${message.conversation}:${message.thread ?? message.id}`
  return {
    id: key('webhook', message.id),
    source: 'webhook',
    threads: [{ source: 'webhook', id: thread }],
    actor: { source: 'webhook', id: message.sender.id },
    human: !message.sender.bot,
    ...(message.mentions_me ? { addressed: 'mention' as const } : {}),
    at: message.at,
    text: message.text,
    channel: { source: 'webhook', thread: `webhook:${thread}`,
      address: { conversation: message.conversation, message: message.id, ...(message.url ? { url: message.url } : {}) } },
    ...(message.url ? { url: message.url } : {}),
    meta: { conversation: message.conversation, messageId: message.id, root: message.thread ?? message.id },
  }
}
```

<Src path="src/sources/github-trigger.ts" lines="65-77" label="对照：github-trigger.ts · commentTrigger()" />

对照 [03 第 1 步](./03-request-lifecycle#step-1-trigger) 贴过的 `commentTrigger`，形状完全一致。四个字段各自承担一个不可推卸的责任：

- **`id` 是确定性的。** `key('webhook', message.id)` 只由队列消息 id 决定。轮询读到第二次得到同一个 id，`Intake.receive` 返回 `duplicate`。想对编辑敏感，就把版本号并进 id——GitHub 用评论的 `updated_at` 就是这个道理。
- **第一行就丢掉 agent 自己的消息。** 返回 `undefined`，调用方 `continue`。否则 agent 会在自己的回复上再开一个 Ticket，而 `human: false` 的兜底在 Gate 之前还有扇出和排队两道关。
- **`human` 和 `addressed` 只记事实。** 一个是"是不是人"，一个是"有没有指向 agent"。这两个布尔值加上 `actor.id` 就是 Gate 的全部输入，正文写什么都改不了它们（[03 第 3 步](./03-request-lifecycle#step-3-gate)）。把判断逻辑写在这里而不是写进 Gate，是为了让所有 Source 共用同一套授权代码。
- **`meta` 放 Source 私货。** `conversation`、`messageId`、`root` 只有 webhook Source 自己解读，核心代码不碰。`scope` 也只会读 `meta`——这是硬要求，因为 Mandate 恢复时 `scope` 只拿得到 `meta` 和配置，没有 Trigger 全文。

注意 `channel.thread` 和 `threads[0].id` 是同一个字符串。这不是巧合：`channel.thread` 决定 Outbox 的**顺序**。`Store.receipts.behind` 用 `ticketId + ' ' + channel.thread` 作复合键，同一个 Ticket 在同一个对话里的后一条消息，要等前一条发出去（或连试三次都失败）才发。不同 Ticket 之间不互相阻塞。

还有一个 `find` 的小东西，Cookbook 顺手给了：

```ts:no-line-numbers
// docs/008-cookbook.md:130
  find: query => ({ threads: [], terms: [...new Set(query.match(/\bm[0-9]+\b/g) ?? [])] }),
```

<Src path="src/sources/github.ts" lines="67-69" label="对照：github.ts · find" />

GitHub 的实现认 `#12`、`12` 和 Issue/PR 的 URL，返回 `github:12`；飞书的实现只抽 `om_xxx` 消息 id 当搜索词。`find` 是纯字符串函数，不能发起网络请求。

## 4. scope：这个 Source 到底听什么 {#scope}

> **问题：** "听到了"和"观察到了"有什么区别？为什么必须是两件事？

Cookbook 第 4 步的 `scope` 只有四行，但它是整个 Source 里语义最密的一段：

```ts:no-line-numbers
// docs/008-cookbook.md:139
  scope({ meta }, config) {
    const conversation = config.conversations.find(item => item.id === meta.conversation)
    if (!conversation) return { listened: false, reason: 'conversation_not_listed' }
    return { listened: true, observed: conversation.listen === 'all', row: conversation.id }
  },
```

<Src path="src/sources/feishu.ts" lines="54-60" label="对照：feishu.ts · scope" />

- `listened: false` 的 Trigger 会被 `Intake.receive` 存下来并记一条 `filtered` 去向，**不创建 Thread**。所以轮询循环里不该自己丢消息，要一律交给 `ctx.receive`，否则面板上无法回答"为什么 agent 没理我"。
- `observed: true` 才让准入表对"没 @ agent 的消息"生效。回看 `gate()` 里的这一行：`const receivable = !!trigger.addressed || (scope.listened && scope.observed)`。只 @ 的消息不受这个开关影响。
- `row` 必须和 `policy.rows` 返回的行 id 对上，否则准入表配置出现在一个不存在的行上。

GitHub 的 `scope` 把这套语义用配置开关实现了：四个 `observeXxx` 布尔量决定 `observed`，`row` 是 `issues`/`pulls`/`comments`/`ci` 之一。飞书按 `chats` 列表和 `otherChats`、`directMessages` 两个兜底档决定。同一个平台可以有两种实现风格，但语义必须一致。

`scope` 只依赖 `meta` 和配置，这条限制来自恢复路径：结束的 Ticket 被人的消息唤醒时，代码要用 Mandate 里存的 `meta` 重新跑一次 `scope`。如果 `scope` 去读 Trigger 的 `text` 或发起网络请求，恢复就废了。

## 5. Channel：幂等地把话说出去 {#channel}

> **问题：** 一条消息发出去了，但响应超时。重试会不会发出两条？

会，除非 `send` 幂等。Cookbook 第 5 步的 `sendWebhook` 把这个问题的答案写全了：

```ts:no-line-numbers
// docs/008-cookbook.md:163
export async function sendWebhook(host: Pick<SourceContext, 'commands'>, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const { conversation, message: to } = message.channel.address
  if (!conversation || !to) throw new Error('Missing webhook reply target')
  try {
    await host.commands.run('hookq', ['reply', '--conversation', conversation, '--to', to, '--key', message.id,
      '--text', message.text])
    return 'sent'
  } catch (error) {
    if (error instanceof CliError && error.code === 410) return 'gone'
    throw error
  }
}
```

<Src path="src/sources/github-channel.ts" lines="17-42" label="对照：github-channel.ts · sendGithub()" />

`--key message.id` 是幂等键。三个真实 Source 用了三种手段达到同一目的：`hookq` 支持 `--key`；飞书有 `--idempotency-key`；GitHub 在评论正文里塞一个 HTML 注释 `<!-- dsh-superagent:<message id> -->`，发送前先翻页找一遍有没有自己发过的带这个标记的评论。

返回值只有两种，但覆盖三种情况：

| 返回 | 含义 | Outbox 的动作 |
| --- | --- | --- |
| `'sent'` | 成功了 | 回执记为 `sent`，永不重试 |
| `'gone'` | 这个对话永远收不到消息了 | 记为 `dropped` + `channelGone`，永不重试，出现在面板的来源页 |
| 抛错 | 可能下次能成 | 5 秒后重试，翻倍到 300 秒 |

`'gone'` 只能用于"永久不可能"。GitHub 的判据是 410（Issue 被删）或 403 且消息里有 locked；飞书的判据是一组错误码和"消息被撤回/找不到"。404 在 GitHub 上**不算** gone，因为私有仓库的临时权限丢失也会返回 404。把可重试的错判成 `gone`，消息就永久丢了。

`allowed(address, config)` 是 Channel 的另一个半：它只看地址和当前配置。飞书的实现是拿 `address.chatId` 重新跑一次 `scope`，看这个群现在还在不在接收范围里。地址已经不在接收范围的消息会被 `channelIgnored` 丢弃——注意这和 Source 被关掉不同，后者让消息继续等着（`Outbox.deliver` 抛 `Later`）。

## 6. threadContext：让研判看得见对话 {#thread-context}

> **问题：** 一个 `inferred` 候选要怎么判断？它读得到上下文吗？

`observe` 模式下模型看不到候选；只有 `auto` 模式下命中启用规则才会真的 accept（[03 第 4 步](./03-request-lifecycle#step-4-route)）。而模型要下判断，就需要对话。这就是 `threadContext` 的存在理由：

```ts:no-line-numbers
// docs/008-cookbook.md:185
  threadContext: {
    messageId: trigger => String(trigger.meta.messageId ?? ''),
    // A queue thread is flat: its root, and the message a reply answers, are on its first page, as on GitHub.
    read: async (commands, trigger, _part, cursor) => {
      const page = ThreadPageSchema.parse(JSON.parse(await commands.run('hookq', ['thread', '--conversation',
        String(trigger.meta.conversation), '--root', String(trigger.meta.root), '--json', ...(cursor ? ['--after', cursor] : [])])))
      const messages = page.items.map(item => ({ id: item.id, from: item.sender.id, at: item.at, text: item.text,
        ...(item.sender.bot ? { bot: true as const } : {}), ...(item.url ? { url: item.url } : {}) }))
      return { messages, ...(page.next ? { next: page.next } : {}), body: { messages } }
    },
  },
```

<Src path="src/sources/github-read.ts" lines="96-130" label="对照：github-read.ts · githubThreadContext" />

`MasterAssessor` 通过 `SourceRegistry.threadContext(trigger)` 拿到它，`orchestrator_eval` 读第一页，`orchestrator_eval_read` 继续翻页、读 root 或读 parent。`messageId` 告诉评估器"这一页里哪条是这条 Trigger 自己的消息"，没有它模型无法定位自己在对话的哪个位置。

`bot: true` 这个标记有实际作用：`ContextMessage` 的注释写明，标记为 bot 的消息"never authorize work on its own (at most an inferred candidate)"。飞书还实现了 `images(text)` 和 `image(...)`，让评估 Session 能看图——Cookbook 的例子省略了它们，注释说"for a kind whose messages carry images"。

`repliesTo(trigger)` 是 `threadContext` 的轻量替代：它不读网络，只从 `meta` 里推算出"这条消息回复的是哪条"，返回那条消息的 Trigger id。飞书的实现是 `trigger.meta.parentId` 走 `feishuTriggerId`。有了它，跟进通知和 worker 的 Input 卡片能带上被回复的消息。

## 7. policy：谁可以在这个 Source 上发起工作 {#policy}

> **问题：** 为什么允许名单要按 Source 分开放，不能有一张全局名单？

因为身份只在 Source 内部有意义。`alice` 在 GitHub 上是一个 login，在飞书上是一个 `ou_` 开头的 open_id，两者的命名空间不相交。上游把每个 Source 的 Policy 部分挂在 `policy.sources.<kind>` 下，由 Source 自己定义 schema：

```ts:no-line-numbers
// docs/008-cookbook.md:215
  policy: {
    schema: z.object({ allowed: z.array(z.object({ id: z.string().min(1), name: z.string().trim().max(100).optional() }).strict())
      .default([]) }).strict(),
    fields: [{ key: 'allowed', type: 'rows', label: { zh: '能发起工作的发送者', en: 'Senders who may originate work' }, columns: [
      { key: 'id', type: 'text', label: { zh: '发送者', en: 'Sender' } },
      { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true }] }],
    explicit: { zh: '名单里的人在消息里 @ 智能体。', en: 'Someone on the list mentions the agent in a message.' },
    rows: stored => ConfigSchema.parse(stored).conversations.map(conversation => {
      const all = conversation.listen === 'all'
      return { id: conversation.id, label: conversation.id, note: all ? { zh: '全部消息', en: 'All' } : { zh: '仅 @', en: '@ only' },
        cells: { listedUnaddressed: all, unlistedAddressed: true, unlistedUnaddressed: all } }
    }),
  },
```

<Src path="src/sources/feishu.ts" lines="70-78" label="对照：feishu.ts · policy.schema 与 fields" />

四个字段各管一件事：`schema` 校验并给默认值；`fields` 生成 **Eval → On each Source** 下的表单；`explicit` 是面板上解释"怎样算明确请求"的一句话；`rows` 列出准入表的行。

`rows` 的 `cells` 是这张表的实质。三个格子对应三种发送者状态：名单内未 @、名单外 @ 了、名单外未 @。Cookbook 例子里 `listedUnaddressed: all`——只有"全部消息"都接收时，名单内的人不 @ 也可能被受理。这跟 [04 章](./04-authorization) 要讲的准入表是同一张表，只是这里的默认值由 Source 的配置决定。

`sync` 是可选的成员同步。飞书用它把一个群的成员拉成允许名单：`ready(part)` 判断填没填群号，`run` 调 `im +chat-members-list`，失败计入 `sync:feishu` 健康项，一分钟起翻倍重试。GitHub 没有 `sync`——GitHub 上没有"这个仓库的成员"这种可拉的名单。

`bots` 也是可选的，两个真实 Source 都有：名单里的 bot 发的消息可以成为 `inferred` 候选，但永远不能 `explicit`，也不能 stop Ticket。这正是本章开头问题 2 里"bot 的评论最多只能成为推断候选"这条规则的落点——它在 `machineGate` 和 `gate()` 里，通过 Policy 的 Source 部分配置。

## 8. environment：worker 需要知道自己在哪 {#environment}

> **问题：** worker Session 怎么知道该去哪个 Issue 回评论？

通过执行环境变量。`src/app/execution-environment.ts` 定义执行器的四个变量（`DSH_SUPERAGENT_DIR`、`NAME`、`TICKET`、`BLOCKED_COMMANDS`），Source 各自追加自己的：

```ts:no-line-numbers
// docs/008-cookbook.md:239
  environment: {
    variables: [{ key: 'DSH_SUPERAGENT_WEBHOOK_CONVERSATION', description: {
      zh: '接下工单的 webhook 对话；工单不是从这个来源来的时为空',
      en: 'The webhook conversation that started the ticket; empty when the ticket did not start on this Source' } }],
    values: ({ trigger }) => ({
      DSH_SUPERAGENT_WEBHOOK_CONVERSATION: trigger?.source === 'webhook' ? String(trigger.meta.conversation ?? '') : '' }),
  },
```

<Src path="src/app/execution-environment.ts" lines="21-35" label="对照：execution-environment.ts · environmentOf()" />

三条规矩，GitHub 的六个变量全都遵守：

1. 前缀是 `DSH_SUPERAGENT_<KIND>_…`，绝不与别的 Source 或执行器冲突。
2. Ticket 不是从这个 Source 来的，值必须是空字符串，不能是 `undefined` 或猜一个。
3. 绝不包含凭据。

`declaredVariables` 让执行设置页在 Source **关闭时**也显示这些变量的说明；`environmentOf` 只在 Source 启用时才计算值。`environmentLines` 把它们拼进 worker 的 prompt 段落——所以变量的 `description` 是写给模型看的，要写成一句完整的指令。

## 9. 插件入口与轮询循环 {#plugin-loop}

> **问题：** 轮询循环里最容易被忽略的三件事是什么？

Cookbook 第 9 步给出插件入口。它很短，但每一行都在处理一个真实的失败：

```ts:no-line-numbers
// docs/008-cookbook.md:257
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(webhookKind), 'webhook: source kind')
  ctx.effect(() => {
    const source = sourceContext(ctx.orchestrator, webhookKind)
    const controller = new AbortController()
    // DSH ends its process on an unhandled rejection, so a failure that escapes the loop becomes the Source's health.
    const running = watch(source, controller.signal)
      .catch((error: unknown) => { source.report('webhook', { state: 'error', detail: String(error) }) })
    return async () => { controller.abort(); await running }
  })
}
```

<Src path="src/sources/feishu.ts" lines="132-139" label="对照：feishu.ts · apply()" />

三个 effect 的生命周期细节：注册是可撤销的（卸载时自动反注册并释放健康项）；循环的 promise 被 `catch` 接住，否则 DSH 会因未处理的拒绝直接杀进程；dispose 时先 abort 再 await，保证重启时不会留下一个还在跑的循环。

循环本身是另一个函数：

```ts:no-line-numbers
// docs/008-cookbook.md:273
async function watch(ctx: SourceContext, signal: AbortSignal): Promise<void> {
  await ctx.ready
  // Setup restarts dsh-superagent once it resolves the accounts; until then the Source reads nothing.
  if (!ctx.configured()) { ctx.report('webhook', health('paused', 'setupPending')); return }
  let failures = 0
  while (!signal.aborted) {
    const config = ctx.config<WebhookConfig>('webhook')
    if (!config) ctx.report('webhook', health('paused', 'sourceOff'))
    else {
      const at = new Date().toISOString()
      try {
        const { read, unreadable } = await pollQueue(ctx, signal)
        failures = 0
        ctx.report('webhook', { state: 'ready', detail: `${read} messages, ${unreadable} unreadable`, at })
      } catch (error) {
        failures += 1
        // One network failure is retried on the next round; three in a row need a person.
        if (!signal.aborted && failures >= 3) {
          ctx.report('webhook', health('error', 'pollFailures', { count: String(failures), error: String(error) }))
        }
      }
    }
    await delay((config?.pollSeconds ?? 30) * 1000, undefined, { signal }).catch(() => {})
  }
}
```

<Src path="src/sources/poll.ts" lines="18-31" label="对照：poll.ts · pollThreads()" />

以及真正干活的那一半：

```ts:no-line-numbers
// docs/008-cookbook.md:300
export async function pollQueue(ctx: SourceContext, signal: AbortSignal): Promise<{ read: number; unreadable: number } {
  const after = ctx.state.get(KV.webhook.cursor) ?? 0
  const output = await ctx.commands.withSignal(signal).run('hookq', ['pull', '--after', String(after), '--json'])
  const page = PageSchema.parse(JSON.parse(output))
  let unreadable = 0
  for (const item of page.items) {
    if (signal.aborted) throw new Error('The webhook Source stopped during the read')
    const message = MessageSchema.safeParse(item)
    if (!message.success) { unreadable++; continue }
    const trigger = webhookTrigger(message.data, page.me)
    if (!trigger) continue
    await ctx.receive(trigger)
    const conversation = { label: { zh: '对话', en: 'Conversation' }, value: message.data.conversation }
    for (const ref of trigger.threads) ctx.threads.describe(threadKey(ref), { facts: { conversation } })
  }
  ctx.state.set(KV.webhook.cursor, page.next)
  return { read: page.items.length, unreadable }
}
```

<Src path="src/app/source-context.ts" lines="33-72" label="对照：source-context.ts · sourceContextOf()" />

循环里最容易忽略的三件事，答案都在 `pollQueue` 里：

1. **游标只在所有 Trigger 都入库之后才前进。** `ctx.state.set` 在循环结束后。中途被打断，游标不动，下一轮重读——而确定性 id 保证重读安全。时间戳游标要用 `cursorAt(started)`（`src/sources/poll.ts`），它会往回退 5 秒，容忍远端的延迟写入。
2. **单条坏数据不毒死整轮。** `safeParse` 失败只 `unreadable++` 然后继续。如果让一条畸形消息抛出，整轮失败，游标不动，下一轮还是失败——这个 Source 会永远卡死。`validItems`（`src/infra/commands.ts`）是同样模式的工具版。
3. **每个 `await` 都检查 `signal`。** 不只是循环条件。一次 `receive` 之间也要查，否则关停时要等一整轮读完。

`ctx.receive` 是 `SourceContext` 上唯一入口 Engine 的路，它的类型是 `Pick<EngineForSources, 'bindThread' | 'threadClosed'>` 加上 `receive`——Source 拿不到 `stopTicket`，更拿不到 `decide`。这就是 [09 章](./09-architecture#engine-views) 说的按角色 Pick。

游标键必须在 `src/kv.ts` 里登记，`tests/store.spec.ts` 会检查键名字面量只出现在那里。Cookbook 给的例子是 `webhook: {cursor: record<number>('webhook-cursor')}`；外部插件可以用导出的 `record` 和 `family` 定义自己的键。

## 10. 注册与检查清单 {#checklist}

> **问题：** 代码写完了，还差哪几步才能让它在面板上出现？

三步机械操作：`tsdown.config.ts` 加 entry、`package.json` 的 `exports` 加一行、`cordis.patch.yml` 的 `insert` 列表加一段（默认 `disabled: true`，和飞书一样）。然后在某个 profile 的 patch 里把它启用。构建、重启，Source 就出现在 Sources 设置页和 **Eval → On each Source** 下。

最后把模块和它的 spec 加进 007 的模块表和测试表——`tests/docs.spec.ts` 会检查两张表与磁盘一致，不加就测试失败。

Cookbook 自己给了一份 <Doc page="008-cookbook" anchor="checklist">检查清单</Doc>，11 条，本章不再复述。补上本教程前几章引出的、清单里没明说的四条：

1. **`id` 必须确定，且不能包含轮询次数。** 这是去重的地基（[03 第 1 步](./03-request-lifecycle#step-1-trigger)）。
2. **第一条 Thread 是主 Thread，Eval 归它。** 多出来的 Thread 只加 Correlation 上下文，不路由（[02 章](./02-domain-model)）。
3. **`channel.thread` 决定回复顺序**，同一个 Ticket 在同一对话里的消息按它排队（第 3 节）。
4. **`meta` 和 `text` 都是不可信数据。** 别在 `scope`、`channel.allowed` 之外的地方拿它们做判断，更别拿它们做授权。

## 回顾 {#recap}

| 步骤 | 写什么 | 上游对应 |
| --- | --- | --- |
| 映射 | Trigger / Thread / Actor / Channel address / scope 的对应表 | <Doc page="008-cookbook" anchor="_1-map-the-events-onto-the-domain">1</Doc> |
| 配置 | `schema`、`fields`、`facts`、`health` | <Doc page="008-cookbook" anchor="_2-configuration-schema-fields-facts-and-health">2</Doc> |
| 翻译 | 一个消息 → 一个 Trigger，确定性 id | <Doc page="008-cookbook" anchor="_3-translate-a-message-into-a-trigger">3</Doc> |
| 接收 | `scope`：`listened` / `observed` / `row` | <Doc page="008-cookbook" anchor="_4-what-the-source-receives-scope">4</Doc> |
| 回复 | `channel.allowed` / `send` / `link`，幂等 | <Doc page="008-cookbook" anchor="_5-replies-the-channel">5</Doc> |
| 上下文 | `threadContext`、`repliesTo` | <Doc page="008-cookbook" anchor="_6-thread-context-for-assessments">6</Doc> |
| 授权 | `policy`：`allowed`、`rows`、`bots`、`sync` | <Doc page="008-cookbook" anchor="_7-who-may-ask-the-source-s-part-of-the-policy">7</Doc> |
| 执行变量 | `environment.variables` / `values` | <Doc page="008-cookbook" anchor="_8-variables-for-the-executor">8</Doc> |
| 循环 | 插件入口 + 轮询 + 游标 + 健康 | <Doc page="008-cookbook" anchor="_9-the-plugin-entry-and-its-loop">9</Doc> |
| 注册 | 构建 entry、导出、patch、文档表 | <Doc page="008-cookbook" anchor="_10-register-the-plugin">10</Doc> |

回到开头的问题 3：`webhook` 在上游仓库里没有实现，`src/sources/` 下只有 `github*.ts` 和 `feishu*.ts`。判断它写得对不对的办法就是拿这两个真实 Source 逐条对账——本章每一节末尾的 `<Src>` 链接就是对账的入口。这也是 Cookbook 一开头就说"Put the kind and its plugin entry in `src/sources/webhook.ts`, following `src/sources/github.ts`"的原因。

最小复刻里 `examples/mini-superagent/src/source.ts` 是同一件事的简化版：一个 `Source` 接口只有 `poll()` 和 `send()` 两个方法，`commentTrigger` 的写法和这里第 3 节一模一样。见 [11 章](./11-build-your-own)。

## 思考题 {#exercises}

1. 一个"每天上午 10 点检查无人认领的 Issue"的需求，按上游设计应该做成 Source 还是 Eval 的一部分？为什么？提示：看 <Doc page="001-domain" anchor="concepts">001 · 概念</Doc> 里 Source 那一行的"定义什么算作一个事件，包括只有经过一段时间才成立的条件"，以及 [被拒绝的设计](/appendix/rejected-designs#eval-schedules-waits) 里关于定时条件的条目。
2. 如果把 `scope` 里的 `observed` 永远返回 `true`，准入表的哪些格子会突然生效？在 `observe` 模式下会产生什么可见变化？
3. `sendWebhook` 把 410 之外的错误全部抛出。如果某个平台用 429 表示"发得太快"，正确的处理是抛出还是返回 `sent`？为什么？
4. 一个 Source 想在自己的 Thread 关闭时通知 Engine（类似 PR 合并），该调用 `SourceContext` 上的哪个方法？它最终走到 Engine 的哪个命令、哪个事务里？
