# 06 可靠性：持久化副作用与恢复

::: info 本章
**前置：** [03 一个请求的一生](./03-request-lifecycle)、[05 执行](./05-execution)
**对应上游：** <Doc page="003-execution" anchor="failure-and-recovery">003 · 故障与恢复</Doc>、<Doc page="007-architecture" anchor="effects">007 · Effects</Doc>、<Doc page="007-architecture" anchor="store">007 · Store</Doc>、<Doc page="007-architecture" anchor="engine">007 · Engine</Doc>、<Doc page="007-architecture" anchor="persistence">007 · 持久化</Doc>
**对应源码：** <Src path="src/app/effects.ts" />、<Src path="src/app/outbox.ts" />、<Src path="src/app/store.ts" />、<Src path="src/app/delivery.ts" />、<Src path="src/app/runtime.ts" />
:::

::: tip 带着这些问题读
1. 进程在任意一行崩溃，重启后会不会重复发评论、重复开 PR、丢消息？
2. 为什么 Engine 的方法里一个 `await` 都没有？
3. GitHub 挂了一小时，这期间 agent 要发的确认和结果会怎样？恢复后顺序会乱吗？
4. 运维者点了“暂停处理”，哪些事停了，哪些还在继续？
:::

![先在账本上记下并盖章，邮车和火箭才出发](/images/store-then-act.jpg)

你可能遇到过这种情况：脚本跑到一半被打断，重跑一遍，结果某封邮件发了两次，或者某条记录少了一条。

对一个只给自己用的脚本，这顶多是个小麻烦。

SuperAgent 的情况不一样。它住在团队的仓库里，一直开着。机器会重启，GitHub 会返回 502，模型提供方会限流。而它的每个副作用都有人看：`alice` 会看到两条一模一样的确认，`bob` 会发现 agent 答应的事没了下文。

这一章还是用 `acme/shop` 的 Issue #42。设想一个具体的夜晚：

- 凌晨两点，#42 的 worker 正在改代码。
- 主 Session 刚接了另一个 Ticket，确认评论正在发往 GitHub。
- 这时机器断电重启了。

第二天早上，`alice` 会看到什么？

这一章分三步回答：先看系统怎样记账（第 1–4 节），再看重启时它怎样对账（第 5 节），最后看暂停和 Engine 的同步写法（第 6–7 节）。

正文里的源码摘自 commit `8c32a9d`，行号与上游一致。英文注释是上游原有的，中文注释是本教程加的。`// …` 表示省略的行。

## 1. 问题：agent 的副作用是对外的 {#problem}

> **问题：** 接单时要写 Decision、Ticket、Assignment，还要在 GitHub 上发一条确认。如果先发评论再写数据库，或者先写数据库再发评论，中间崩溃会怎样？

两种顺序都有问题。

**先发评论再写库：** 评论发出去了，进程在写库前崩溃。重启后，数据库里没有这个 Ticket，那条 Trigger 还在 Eval 队列里。主 Session 再判断一次、接一次单，`alice` 收到第二条确认。

**先写库再发评论：** 库写好了，进程在调 GitHub API 前崩溃。重启后，Ticket 存在，但没有任何代码记得“还欠一条评论”。`alice` 什么都收不到，以为 agent 没接单。

问题的根源是：数据库的写入可以放进一个事务里，GitHub 上的评论不行。两者之间总有一个窗口。

SuperAgent 的做法是把“要发一条评论”这件事本身**也写进数据库**，和 Ticket 放在同一个事务里。事务提交后，再由另一段代码去真正发评论；发成功了，才把这行记录删掉。

这样窗口两边就都有着落了：

- 事务没提交就崩溃：什么都没写，也什么都没发。重启后从头再来。
- 事务提交了、评论还没发就崩溃：“要发评论”这一行还在数据库里，重启后接着发。

剩下的窗口只有一个：评论已经发出去，删除那一行之前崩溃。重启后会再发一次。第 3 节会讲上游怎样让“再发一次”不产生重复评论。

这套做法在上游叫“先存储，后执行”（<Doc page="003-execution" anchor="stored-work">003 · 持久化的待办工作</Doc>）。插图里的账本和邮车画的就是它：先在账本上记下并盖章，邮车才出发。

读下一节时，可以留意“要做的事”在数据库里长什么样。

## 2. 先存再做：Effects 队列 {#effects}

> **问题：** 同一件事被入队两次，比如一个 Ticket 连续收到两条 Input，各自要求“投递一次”，队列里会有两行吗？

只有一行。

`Effects` 是一个存在 SQLite 里的队列，表名 `effect`，主键是 `(kind, key)`（<Src path="src/app/store.ts" lines="80-82" />）。`kind` 是这件事的种类，`key` 是它的身份：

| kind | 做什么 | key |
| --- | --- | --- |
| `assessment` | 把 Eval 的候选卡片送进主 Session | Eval ID |
| `launch` | 启动一个 pending 的 Assignment | Assignment ID |
| `delivery` | 把 Ticket 等待中的 Input 交给 worker | Ticket ID |
| `relay` | 把报告或跟进转给主 Session | 请求 ID |
| `notice` | 向主 Session 注入一条不唤醒它的通知 | 通知名 |
| `reply` | 通过 Source 往 GitHub 或飞书发一条消息 | 消息 ID |

这张表来自 `EffectPayloads` 的注释（<Src path="src/app/effects.ts" lines="11-24" label="effects.ts · EffectPayloads" />）。`delivery` 的 key 是 Ticket ID，而不是 Input ID，所以一个 Ticket 无论攒了多少条 Input，都只有一行“去投递”；handler 运行时会把 `undelivered` 里的 Input 按顺序一条条送完。

入队是一条 upsert：

```ts:no-line-numbers
// src/app/effects.ts:60
/** Upserts an effect in the caller's transaction, coalescing with any waiting row of the same kind and key while keeping its queue position. */
enqueue<K extends EffectKind>(kind: K, key: string, payload: EffectPayloads[K]): void {
  // 冲突时更新 payload、generation +1、清零失败次数、立即到期；不更新 seq，所以队列位置不变
  this.store.db.prepare(`INSERT INTO effect (kind, key, value, seq, due, since) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kind, key) DO UPDATE
    SET value = excluded.value, generation = generation + 1, attempts = 0, error = '', due = excluded.due`)
    .run(kind, key, JSON.stringify(payload), ++this.seq, this.now(), new Date(this.now()).toISOString())
  // kick 把 dispatch 推到下一个微任务；那时调用方的同步事务已经提交
  this.kick()
}
```

<Src path="src/app/effects.ts" lines="60-66" label="effects.ts · Effects.enqueue()" />

注意这个方法没有开事务。它写在**调用方的事务里**：Engine 的命令先开事务，修改 Ticket，再调用 `executor.start()` 或 `outbox.send()`，后者最终调用 `enqueue()`。事务回滚，这一行也跟着消失。

那么什么时候真正执行？`kick()` 把 `dispatch()` 推到下一个微任务。Engine 的命令是同步的，事务在同一个调用栈里就提交了，`dispatch()` 运行时看到的已经是提交后的数据。第 7 节会回到“Engine 为什么必须同步”。

执行一行的结果有三种，都在 `attempt()` 里：

```ts:no-line-numbers
// src/app/effects.ts:130
private async attempt(kind: EffectKind, handler: Handler<never>, row: Row): Promise<void> {
  let failure: { error: unknown } | undefined
  try { await handler.run(JSON.parse(row.value) as never, row.key) } catch (error) { failure = { error } }
  // Match seq and generation so a row replaced or re-queued while running is not overwritten.
  const own = 'kind = ? AND key = ? AND seq = ? AND generation = ?', ownRow = [kind, row.key, row.seq, row.generation] as const
  // ① 成功：删掉这一行
  if (!failure) this.store.db.prepare(`DELETE FROM effect WHERE ${own}`).run(...ownRow)
  // Leave running rows untouched on shutdown so they retry on the next start.
  else if (this.stopped) return
  // ② Later：“现在不能做”，推迟 retry[0] 毫秒，不计失败
  else if (failure.error instanceof Later) {
    this.store.db.prepare(`UPDATE effect SET due = ? WHERE ${own}`).run(this.now() + handler.retry[0], ...ownRow)
  } else {
    // ③ 真失败：失败次数 +1，指数退避，封顶 retry[1]
    const delay = Math.min(handler.retry[1], handler.retry[0] * 2 ** Math.min(row.attempts, 16))
    this.store.db.prepare(`UPDATE effect SET attempts = attempts + 1, error = ?, due = ? WHERE ${own}`)
      .run(String(failure.error).slice(0, 1000), this.now() + delay, ...ownRow)
  }
  if (!this.stopped) this.report(kind)
}
```

<Src path="src/app/effects.ts" lines="130-146" label="effects.ts · Effects.attempt()" />

有两个细节值得停一下。

**`generation` 防的是“边跑边被改”。** 设想 `delivery` 正在给 #42 投递第一条 Input，这时第二条 Input 到了，`enqueue()` 把同一行的 `generation` 加一。第一次投递完成后，`DELETE … AND generation = ?` 匹配不上，这一行留下来，于是第二条 Input 不会被漏掉。

**`Later` 不算失败。** 槽位满了（[05 · 并发与 worker 槽位](./05-execution#slots)）、处理被暂停、Source 没开，都不是“出错”。如果把它们算作失败，退避会越拉越长，面板也会报错。`Later` 让这一行在固定的短间隔后再试。

读下一节时，可以留意 `reply` 这种 effect：它要发往外部，失败的方式也最多。

## 3. Outbox 与消息顺序 {#outbox}

> **问题：** GitHub 返回了一小时的 502。这期间 #42 的 Ticket 先要发确认“我来修”，后来又要发结果“PR 已开好”。恢复后，`alice` 会不会先看到结果、后看到确认？

不会。先看一条消息从入队到发出的全过程。

`Outbox.send()` 在一个事务里做两件事：在 `outbox` 表里记一张**回执**（状态 `pending`），再入队一个 `reply` effect，key 是消息 ID（<Src path="src/app/outbox.ts" lines="26-32" label="outbox.ts · Outbox.send()" />）。回执用 `INSERT OR IGNORE` 写入，同一个消息 ID 第二次 `send()` 什么也不做。

消息 ID 是从内容算出来的。确认的 ID 是 `key('ack', trigger.id)`，结果和回答是 `key('reply', …, text)`（<Src path="src/core/replies.ts" lines="79" />）。`key()` 对参数做 SHA-256（<Src path="src/core/ids.ts" lines="3-5" />），同样的输入永远得到同样的 ID。

`reply` effect 的 handler 是 `deliver()`：

```ts:no-line-numbers
// src/app/outbox.ts:39
private async deliver(id: string): Promise<void> {
  const { store, sources, commands } = this.host
  const receipt = store.receipts.get(id)
  // 已发出、已丢弃、已撤回：什么也不做，effect 行会被删掉
  if (receipt?.status !== 'pending') return
  if (!sources.instance(receipt.channel.source)?.enabled) throw new Later('The Source is off or not installed')
  // Hold later messages for the same ticket and conversation behind an earlier pending message until it exceeds the failure threshold.
  if (store.receipts.behind(id, FAILURES_BEFORE_ERROR)) throw new Later('An earlier message of this ticket to this conversation waits')
  if (!sources.channelAllowed(receipt.channel)) { store.receipts.settle(receipt, 'channelIgnored'); return }
  // A permanently unreachable target (such as a recalled message or deleted Issue) settles as `channelGone` so its receipt prevents retries.
  const result = await sources.send(receipt, commands)
  if (result === 'waiting') throw new Later('The Source is not installed')
  store.receipts.settle(receipt, result === 'gone' ? 'channelGone' : 'sent')
}
```

<Src path="src/app/outbox.ts" lines="39-51" label="outbox.ts · Outbox.deliver()" />

**顺序**由 `behind()` 保证。`outbox` 表有一个生成列 `pending`，值是“Ticket ID + 会话”，只在状态为 `pending` 时有值（<Src path="src/app/store.ts" lines="41-43" />）。`behind()` 查的是：同一个 Ticket、同一个会话里，有没有更早写入、仍在 pending、而且失败还不到 3 次的消息（<Src path="src/app/store.ts" lines="258-261" label="store.ts · receipts.behind()" />）。

所以 502 那一小时里：

- 确认在重试，失败次数涨到 1、2、3。
- 结果每次轮到时都发现确认还在前面，抛 `Later`，5 秒后再看。
- 确认失败满 3 次后，结果不再等它（<Doc page="003-execution" anchor="channel-failure">003 · Channel 故障</Doc>）。

为什么是“失败 3 次就不等了”？推测是为了不让一条永远发不出去的消息卡住整个 Ticket 的对外沟通。3 次之后，运维者已经能在面板上看到问题。

别的 Ticket 发往同一个 Issue 的消息不等它，因为 `pending` 列里带着 Ticket ID。

**重发不重复。** 回到第 1 节剩下的那个窗口：评论发出去了，删除 effect 行之前进程崩溃。重启后 `deliver()` 再跑一次，GitHub 一侧会怎样？

```ts:no-line-numbers
// src/sources/github-channel.ts:33
const path = rootId === undefined ? `issues/${number}/comments` : `pulls/${number}/comments`
// 每条评论末尾都带一个隐藏标记，里面是消息 ID
const marker = `<!-- dsh-superagent:${message.id} -->`
const mine = (comment: z.infer<typeof CommentSchema>) => sameName(comment.user?.login ?? '', github.login)
  && (rootId === undefined || comment.in_reply_to_id === rootId) && (comment.body ?? '').includes(marker)
// 先翻一遍已有评论：agent 自己发过带这个标记的，就当作已发出
if ((await commands.pages(CommentSchema, path)).some(mine)) return 'sent'
const target = rootId === undefined ? path : `${path}/${rootId}/replies`
await commands.api(z.unknown(), target, '--method', 'POST', '-f', `body=${message.text}\n\n${marker}`)
return 'sent'
```

<Src path="src/sources/github-channel.ts" lines="33-40" label="github-channel.ts · sendGithub()" />

飞书那边用的是平台自带的幂等键：`--idempotency-key` 传的就是消息 ID，飞书对同一个键最多保留一条回复（<Src path="src/sources/feishu-channel.ts" lines="18-23" label="feishu-channel.ts · sendFeishu()" />）。

**什么时候放弃。** 只有两种情况：Source 不再监听这个会话（`channelIgnored`），或者 Source 说这个会话永远收不到了（`channelGone`）。GitHub 的“永远收不到”指 410（Issue 被删）或带 “locked” 的 403；404 会被重试，因为私有仓库暂时失去权限时也返回 404（<Src path="src/sources/github-channel.ts" lines="13-15" />）。Source 关着的时候，消息等着，不丢。

被丢弃的消息，回执保留下来，状态是 `dropped`。同一个 ID 以后再 `send()`，`INSERT OR IGNORE` 什么也不做。这就是上游说的“永远不会再次入队”。

**撤回。** 有一种消息在发出之前可能就过时了：给人的问题。

设想 #42 的 worker 报告：“金额要四舍五入还是截断？”这会产生一条 Attention，以及一条待发的回复，ID 是 `key('attention-reply', attention.id)`。GitHub 正在 502，这条回复没发出去。几分钟后 worker 自己查到了规范，又报告了一次，把问题换掉或清掉。

旧问题还要发出去吗？不该发。`Assignments.report()` 在问题被替换或清除时调用 `withdrawAttention()`（<Src path="src/core/assignments.ts" lines="120-121" />），最终在一个事务里删掉 pending 的回执，并取消对应的 `reply` effect（<Src path="src/app/outbox.ts" lines="34-37" label="outbox.ts · Outbox.withdraw()" />）。

如果撤回时这条消息正在发送中呢？`effects.cancel()` 删不掉正在运行的那次尝试。发送完成后，`settle()` 发现回执已经不在了，会**重新插入**一张已了结的回执，“so its ID cannot be queued again”（<Src path="src/app/store.ts" lines="270-281" label="store.ts · receipts.settle()" />）。这种情况下消息确实发出去了，但它的 ID 不会再被排队。

读下一节时，可以留意 `deliver()` 抛出的错误被怎样计数。

## 4. 重试与退避 {#retry}

> **问题：** 模型提供方返回了一次 429，#42 的 worker 这一回合失败了。Ticket 会直接变成 **Failed** 吗？面板会立刻亮红灯吗？

都不会。上游区分两类失败：**过一会儿就好的**，和**需要人看的**。

前一类有一个明确的判定函数，以及每个 Assignment 3 次的额度：

```ts:no-line-numbers
// src/executor/dsh.ts:44
const PASSING = new RegExp(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'UND_ERR', 'socket hang up', 'fetch failed',
  'network error', 'overloaded', 'rate limit', '\\b(?:408|429|50[0-4])\\b'].join('|'), 'i')
export function transient(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status
  // 有数字状态码时只看状态码：408、429、5xx
  if (typeof status === 'number') return status === 408 || status === 429 || status >= 500
  const text = error instanceof Error ? `${error.name} ${error.message} ${String((error as { code?: unknown }).code ?? '')}` : String(error)
  return PASSING.test(text)
}
// …
private retries(key: string, error: unknown): boolean {
  // key 是 assignment.id（worker 回合）或 launch:<assignment.id>（启动）
  const tries = this.transient.get(key) ?? 0
  if (!transient(error) || tries >= TRANSIENT_TRIES) { this.transient.delete(key); return false }
  this.transient.set(key, tries + 1)
  return true
}
```

<Src path="src/executor/dsh.ts" lines="44-55" label="dsh.ts · transient()" />、<Src path="src/executor/dsh.ts" lines="548-553" label="dsh.ts · retries()" />

用到它的地方有两处，退避方式不一样：

- **worker 回合失败**（`agent/error` 事件）：`resumeAfter()` 在 15 秒、30 秒、60 秒后给 worker 发一句“上一回合因为暂时性原因失败了，从停下的地方继续”（<Src path="src/executor/dsh.ts" lines="555-576" label="dsh.ts · resumeAfter()" />）。这段时间 Ticket 不报告任何状态，回合计数在下一个正常结束的回合清零。
- **启动失败**：`launchQueued()` 把错误抛回 effect 队列，由 `launch` 的退避（5 秒起，翻倍，封顶 300 秒）决定下一次时间。准备命令失败不重试，原因见 [05 · Executor Session 与目录](./05-execution#executor)。

3 次用完、或者错误本身不是暂时性的，Ticket 才记为 `failed`，进入 **Failed** 阶段，等人处理。

**面板什么时候亮红灯？** 每种 effect 在健康面板上有一个条目。`report()` 的判断是：这一类里有某一行失败次数达到 `FAILURES_BEFORE_ERROR`（3），且这一类没有被标为 `quiet`（<Src path="src/app/effects.ts" lines="151-160" label="effects.ts · report()" />）。

`delivery` 是 `quiet` 的（<Src path="src/executor/dsh.ts" lines="234-235" />）。它的失败直接写在 Ticket 上，显示为 **Input undelivered**，在面板上属于那个 Ticket，不算全局问题。这也回答了 [05](./05-execution#stages) 里“为什么 `delivery` 排在阶段表第一位”的一半原因：投递失败时，人需要在 Ticket 上看到它。

“失败 3 次才算问题”和 [08 · 一次网络抖动不算问题](./08-panel#quiet) 是同一个原则。偶发的 502 运维者处理不了，告诉他只会让他以后忽略告警。

外发消息是一个例外。上游说“有失败尝试的消息在发出或被撤回之前，都算作系统问题”（<Doc page="003-execution" anchor="channel-failure">003 · Channel 故障</Doc>），Overview 上的外发问题从第一次失败就显示，[08](./08-panel#quiet) 已经指出了这一点。`reply` 的健康条目本身仍按 3 次的规则变红。

还有一类等待不归这里管：模型预算用完时，DeepSeek Harness 自己会重试。`RetryHealth` 只是从 Session 事件里**观察**这些等待，显示在 `models` 健康条目上，“without modifying retry policy or logs”（<Src path="src/app/retry-health.ts" lines="1" />）。

**人手动重试。** 当 Ticket 处于 **Input undelivered**、**Blocked** 或 **Failed** 时，面板提供重试（<Doc page="003-execution" anchor="retry">003 · 重试</Doc>）。`Tickets.retry()` 结束当前 Assignment，把它收到却没读的消息放回队首，再开一个新的 Assignment，在同一个 Session、目录和分支里继续（<Src path="src/core/tickets.ts" lines="164-180" label="tickets.ts · retry()" />）。

读下一节时，可以留意“收到却没读的消息”在重启时怎样被找回来。

## 5. 重启恢复 {#restart}

> **问题：** 回到开头那个夜晚。凌晨两点断电时，#42 的 worker 正在跑一个回合。重启后，系统怎么知道该接着做什么？worker 会不会把已经推送的提交再推一遍？

先看重启时代码按什么顺序做事。`Runtime.initialize()` 在初始化检查通过、主 Session 就绪之后，依次调用 `executor.resume()`、`passes.start()`、`effects.start()`（<Src path="src/app/runtime.ts" lines="201-218" label="runtime.ts · Runtime.initialize()" />）。

顺序是有意的。`executor.resume()` 先对账，把每个 Ticket 的 Assignment 理清楚；然后每 2 秒一轮的 pass 开始运转；最后 effect 队列开始消费。断电前留在 `effect` 表里的行，这时才开始执行。

`resume()` 按接单先后遍历所有未结束的 Ticket（<Src path="src/executor/dsh.ts" lines="519-537" label="dsh.ts · DshExecutor.resume()" />）：

- 最新的 Assignment 还是 `pending`，且不在等人：重新入队一个 `launch`。启动本来就是幂等的，`launchQueued()` 会先检查它是否仍是最新的 pending Assignment。
- 有一个 `running` 的 Assignment：先取消 Session 里可能还在跑的回合、停掉后台工作，再交给 Engine 判断。

判断在 `Assignments.interrupted()` 里：

```ts:no-line-numbers
// src/core/assignments.ts:83
interrupted(ticketId: string, assignmentId: string): void {
  const ticket = this.running(ticketId, assignmentId)
  const running = ticket && runningAssignment(ticket)
  if (!ticket || !running) return
  const report = running.report
  // busy：最后一条报告之后又有 Input 送进去，说明 worker 在处理新东西
  const busy = !!running.deliveredAt && !!report && running.deliveredAt >= report.at
  // settled：worker 已经说完了自己的话，正在等别人
  const settled = !!report && ['waiting', 'ready', 'blocked', 'failed'].includes(report.state) && !busy
  // 没说完：结束这个 Assignment（原因 hostRestarted），开一个新的，第一条消息是恢复说明
  if (!settled) this.tickets.restart(ticket, running, 'hostRestarted', RECOVERY_NOTE)
  // 说完了：保持原样，只把等着的 Input 送过去
  else if (ticket.undelivered.length) this.options.executor.deliver(ticket, running)
}
```

<Src path="src/core/assignments.ts" lines="83-92" label="assignments.ts · Assignments.interrupted()" />

#42 的 worker 断电时正在改代码，最后一条报告是 `progress`，不算 settled。于是它得到一个新的 Assignment，第一条消息是这段恢复说明：

> The host restarted during this ticket. Inspect the current worktree, git history and GitHub state before continuing. Do not repeat an already completed external operation. Finish the original assignment and report its status.

（<Src path="src/core/assignments.ts" lines="21" />）

这里要说清楚系统做到了什么、没做到什么。

**系统能保证的：** 它自己的副作用不重复、不丢失。确认、回复、转给主 Session 的报告、投递给 worker 的消息，都有确定的 ID 和去重手段。

**系统保证不了的：** worker 在 shell 里做的事。`git push`、`gh pr create` 是 worker 用工具执行的，系统不知道它们执行到了哪一步。所以恢复说明要求 worker 先看 worktree、git 历史和 GitHub，再决定下一步。这一层靠的是模型照着指令去核对，而不是代码。

同一个 Session 和目录被保留下来，worker 能看到自己断电前的历史，这让核对容易得多。

**投递给 Session 的消息怎么去重？** 所有发进 Session 的消息都走 `AgentDelivery.send()`：

```ts:no-line-numbers
// src/app/delivery.ts:66
async send(agent: Agent, requestId: string, text: string, mode: 'queue' | 'steer' | { inject: string }, signal: AbortSignal, authorize?: () => void,
  accepted?: () => void): Promise<void> {
  signal.throwIfAborted()
  // history：从持久化的 Session 事件里读出所有已经进入历史的消息 ID（只读一次，之后靠事件增量更新）
  const seen = await this.history(agent)
  signal.throwIfAborted()
  if (this.ctx.agents.get(agent.id) !== agent) throw new Error('Delivery target was disposed')
  authorize?.()
  // 消息 ID 由请求 ID 决定：dsh-superagent:<requestId>，每次重试都一样
  const id = messageId(requestId)
  const pending = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => deliveryId(message) === id)
  // 历史里有了，或者 inbox 里还排着：都不再发
  if (!seen.ids.has(id) && !pending) {
    // …构造消息，按 mode 放进 inbox 或直接注入历史
  }
  accepted?.()
  // 等 Session 持久化落盘后才返回；返回后 effect 行才会被删掉
  await this.ctx.sessionPersistence.flush()
}
```

<Src path="src/app/delivery.ts" lines="66-85" label="delivery.ts · AgentDelivery.send()" />

所以 `relay` 发到一半崩溃、重启后再发一次，主 Session 只会看到一份。

还有一种更细的情况：消息已交给 Session（`readAt === null`），但认领它的那一步被断电打断，消息没有进入历史。`Tickets.restart()` 里的 `requeueUntaken()` 把这类消息放回新 Assignment 的队首；新 Assignment 启动时，`launch()` 先从 inbox 里删掉可能残留的旧副本，“that copy is the only one”（<Src path="src/core/tickets.ts" lines="328-337" label="tickets.ts · requeueUntaken()" />、<Src path="src/executor/dsh.ts" lines="446-448" />）。

**Trigger 也不会丢。** GitHub Source 轮询时，先对每一条调用 `receive()`，最后才推进游标（<Src path="src/sources/github.ts" lines="224-248" />）。中途崩溃，游标没动，下一轮重读同样的条目；Trigger 的 ID 是确定性的，[03 · Intake](./03-request-lifecycle#step-2-intake) 的第一步就会把重复的那条认出来。

**两个进程不会同时写。** 启动时 Runtime 先拿到状态目录的锁（<Src path="src/app/runtime.ts" lines="93" />），关闭时先关数据库再释放锁（<Src path="src/app/runtime.ts" lines="244-251" />）。

### 崩溃点与结果 {#crash-table}

把前面几节放在一起，可以列出“在这里崩溃会怎样”：

| 崩溃发生在 | 重启后 | 依据 |
| --- | --- | --- |
| Engine 命令的事务提交之前 | 事务里的写入全部消失，effect 行也不存在；什么都没发出去。Trigger 会被重新轮询，按 ID 去重 | `Store.atomic()` 的 SAVEPOINT；WAL + `synchronous=FULL`（<Src path="src/app/store.ts" lines="64" />）；`Intake.receive()` 的去重 |
| 事务已提交，effect 还没执行 | effect 行还在，`effects.start()` 之后照常执行 | `effect` 表；`Runtime.initialize()` |
| GitHub 评论已发出，effect 行删除之前 | 再执行一次 `sendGithub()`，找到带标记的评论，直接返回 `sent` | `<!-- dsh-superagent:id -->` 标记 |
| 飞书回复已发出，effect 行删除之前 | 再发一次，飞书按幂等键去重 | `--idempotency-key` |
| 转给主 Session 的报告已进历史，effect 行删除之前 | 再执行一次，`AgentDelivery` 在历史里找到同一个 ID，不再发 | `messageId(requestId)`；`history()` |
| 准备命令跑到一半 | Assignment 还是 pending，重新启动。目录不存在就重新准备；**目录已存在会被当作准备好了** | `resume()`；`launch()` 只检查目录是否存在（推测这是一个风险点） |
| worker 正在跑回合 | Assignment 以 `hostRestarted` 结束，新 Assignment 带恢复说明；worker 自己核对 git 和 GitHub | `Assignments.interrupted()`；`RECOVERY_NOTE` |
| worker 已报告 `ready` 或 `waiting`，在等人 | 保持原样，不打扰 | `interrupted()` 里的 `settled` |
| 消息已交给 Session，认领它的那一步被打断 | 放回新 Assignment 的队首，旧副本从 inbox 删除，只投递一次 | `requeueUntaken()`；`launch()` 里的 `inbox.remove` |
| 一个 `afterCommit` 回调（例如取消 worker 回合）还没执行 | 回调丢失；但 `resume()` 会取消残留的回合并停掉后台工作 | `Store.afterCommit()` 的注释：它只用于“need not survive a restart”的事 |
| 撤回一条待发问题时，消息正在发送 | 消息已发出；`settle()` 重新插入回执，这个 ID 不会再被排队 | `receipts.settle()` |

读这张表时，可以注意一个规律：**能用代码去重的，代码去重；代码看不见的（worker 的 shell 操作），交给 worker 按说明核对。**

读下一节时，可以留意另一种“停下来”：不是崩溃，而是运维者主动按下暂停。

## 6. 暂停处理 {#pause}

> **问题：** 运维者发现 Policy 配错了，想先让 agent 停手、改好再继续。按下“暂停处理”之后，正在跑的 worker 会被打断吗？暂停期间 `alice` 发的新评论会丢吗？

都不会。

暂停是一个设置项。`Runtime.paused()` 在初始化未完成或设置里 `paused` 为真时返回 `true`，注释写着它的范围：“Hold evaluation, dispatch, and outbound delivery while paused or awaiting setup; sources still record incoming triggers.”（<Src path="src/app/runtime.ts" lines="199-200" />）

具体落在几个地方，每个都只是一个开关：

| 停下的 | 怎么停的 |
| --- | --- |
| 候选送进主 Session | `assessment` 的并发上限变成 0（<Src path="src/app/assessment.ts" lines="101" />） |
| 启动 Assignment | `launch` 的并发上限变成 0；已经在启动的，`current()` 抛 `Later`，稍后重来（[03 · 启动执行器](./03-request-lifecycle#step-7-launch)） |
| 投递 Input | `delivery` 的并发上限变成 0 |
| 发往 GitHub 和飞书的消息 | `reply` 的并发上限变成 0 |
| 新 Eval、唤醒已结束的 Ticket | `evaluateDue()` 在 `policy.paused` 时提前返回（<Src path="src/core/engine.ts" lines="75-85" label="engine.ts · evaluateDue()" />） |
| Eval 超时 | `Evals.due()` 记下暂停开始的时间；恢复时把截止时间顺延暂停的时长（<Src path="src/core/evals.ts" lines="35-46" label="evals.ts · Evals.due()" />） |

继续的：

- Source 照常轮询，`receive()` 照常存储 Trigger。`alice` 的评论被记下，等恢复后处理。
- 正在跑的 worker 回合不被打断。它的报告照常写库，转给主 Session 的 `relay` 也照常执行，因为 `relay` 和 `notice` 的 handler 没有接暂停开关（<Src path="src/app/sessions.ts" lines="103-105" />）。这一点是从代码读出来的，上游文档没有单独列出。

注意“Eval 超时”那一行。暂停 20 分钟时，一个本来还剩 5 分钟的 Eval 不会过期；恢复后它还剩 5 分钟。如果不顺延，暂停一结束，所有进行中的 Eval 会同时超时，被记为 `unavailable`。

暂停时也没有任何东西被删除或标记为失败。所有被搁置的工作都还在 `effect` 表和 `thread.pending` 里，只是暂时没人去取。所以恢复处理不需要“恢复”逻辑：开关一关，下一轮 pass 和 dispatch 就接着做。

读下一节时，可以留意这种“只是不去取”的设计依赖于什么前提：队列里的每一行都必须能在任何时候被安全地执行。

## 7. Engine 为什么全是同步的 {#defensive}

> **问题：** Engine 的方法里没有一个 `await`。可是接单要调模型，投递要写 Session，发评论要调 GitHub。这些异步的事放在哪里了？

放在 Engine 外面了。

上游这样描述：“Engine 的所有方法都是同步的。每条命令在一个事务里修改它涉及的聚合。……端口在事务内把外部工作入队，适配器在提交之后执行。”（<Doc page="007-architecture" anchor="engine">007 · Engine</Doc>）

这条规则落在 `Store.atomic()` 上：

```ts:no-line-numbers
// src/app/store.ts:140
atomic<T>(operation: () => T): T {
  const level = this.depth++
  const name = `orchestrator_atomic_${level}`
  this.committed[level] = []
  this.db.exec(`SAVEPOINT ${name}`)
  let value: T
  // operation 的类型是 () => T，不是 () => Promise<T>：事务里不能有 await
  try { value = operation(); this.db.exec(`RELEASE ${name}`) }
  catch (error) { this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`); throw error }
  finally { this.depth-- }
  // 内层事务的回调交给外层；最外层提交后才执行。回滚的那一层，回调随 splice 一起丢掉
  const actions = this.committed.splice(level)[0]!
  if (level) this.committed[level - 1]!.push(...actions)
  else for (const action of actions) { try { action() } catch (error) { this.report(error) } }
  return value
}
afterCommit(action: () => void): void {
  if (this.depth) this.committed[this.depth - 1]!.push(action)
  else action()
}
```

<Src path="src/app/store.ts" lines="140-162" label="store.ts · Store.atomic() 与 afterCommit()" />

为什么非得同步？设想 `atomic()` 接受一个异步函数，里面 `await` 了一次 GitHub API：

- 事务会在 `await` 期间一直开着。Node 是单线程的，别的代码这时也会跑，也会调用 `atomic()`。它们会落进同一个 SAVEPOINT 栈里，层级全乱了。
- GitHub 调用成功、之后的写入失败回滚，评论已经发出去，收不回来。这正是第 1 节那个窗口。

同步事务让这两个问题都不存在：事务从开始到提交，中间不会有别的代码插进来，也不会有任何对外的动作。

**`afterCommit` 是给什么用的？** 有些后续动作很急，又不必在重启后保留，比如取消 worker 正在跑的回合、刷新健康条目。注释说得很清楚：这类事用 `afterCommit`；“use `Effects` for durable side effects that must survive a crash”（<Src path="src/app/store.ts" lines="154-158" />）。

[05 · 后台任务](./05-execution#background) 里的 `DshExecutor.stop()` 就是这样用的：Ticket 的结束写在事务里，取消 worker 回合放进 `afterCommit`（<Src path="src/executor/dsh.ts" lines="352-370" label="dsh.ts · stop()" />）。如果结束的事务回滚了，worker 不会被误停。

**异步代码那一侧怎么办？** 适配器在提交之后执行，它们手里拿的是一个可能已经过时的快照。所以它们在每个 `await` 之后重新读库。你已经在 [03 · 启动执行器](./03-request-lifecycle#step-7-launch) 里见过 `launch()` 的 `current()`；本章里的 `deliverQueued()` 每投递一条都重读 Ticket，`Outbox.deliver()` 先看回执是否还是 pending，`assessment` 的 handler 先检查 Eval 是否还是这一个（<Src path="src/app/assessment.ts" lines="94-102" />）。

如果某个异步操作需要把结果写回去，它再调用一个同步的 Engine 命令，开一个新事务。工具 `orchestrator_report` 是一个好例子：读 PR 信息是异步的，放在事务外；认领 PR、记录报告、入队 relay 放在同一个 `atomic()` 里，“so a rejected PR claim or invalid report leaves no partial state, and a recorded report always reaches the main Session”（<Src path="src/app/tools/executor.ts" lines="85-102" />）。

把这一节归纳成一句话：**事务里只有同步的写入，事务外只有幂等的执行。** 前面几节的去重和对账，都建立在这条分工上。

## 回顾 {#recap}

| 机制 | 关键代码 | 它保证的事 |
| --- | --- | --- |
| 先存再做 | `Effects.enqueue()`、`attempt()` | 要做的事和状态变化在同一个事务里；提交后才执行，成功后才删除 |
| 合并与防覆盖 | `(kind, key)` 主键、`generation` | 同一件事只有一行；执行中被更新的行不会被误删 |
| 外发顺序 | `receipts.behind()` | 同一 Ticket 发往同一会话的消息按顺序发出，前一条失败 3 次后不再挡路 |
| 外发去重 | 隐藏标记、飞书幂等键、`outbox` 回执 | 重发不产生重复评论；丢弃和撤回过的 ID 不会再被排队 |
| 重试 | `transient()`、`retries()`、指数退避 | 暂时性故障自动恢复；失败 3 次才在面板上报错 |
| 重启 | `resume()`、`interrupted()`、`AgentDelivery` | 系统自己的副作用不重复；没说完的 worker 带着恢复说明重新开始 |
| 暂停 | 各 effect 的 `limit` 返回 0、`Evals.due()` | 停下派发和外发，不丢 Trigger，不让 Eval 过期 |
| 同步 Engine | `Store.atomic()`、`afterCommit()` | 事务中间没有 `await`，也没有对外动作 |

回到开头的四个问题：

1. 系统自己的副作用不会重复，也不会丢：评论有标记，飞书有幂等键，Session 消息有确定的 ID，Trigger 有确定的 ID，游标在处理完之后才推进。worker 在 shell 里做的事，系统看不见，靠恢复说明让 worker 先核对再继续。
2. 因为事务里不能有 `await`。异步的事都以 effect 的形式写进事务，提交之后由适配器执行。
3. 消息都在 `outbox` 和 `effect` 表里等着，退避从 5 秒到 300 秒。同一 Ticket 发往同一会话的消息按顺序发；前一条失败满 3 次后，后面的不再等它。
4. 停下的是候选、启动、投递、外发、新 Eval 和 Eval 超时；继续的是 Source 的记录和正在跑的 worker 回合。

## 思考题 {#exercises}

1. 如果 `reply` effect 发出评论后、删除队列行之前进程崩溃，会发生什么？上游怎样减小这个窗口的影响？如果 GitHub 的评论列表接口这时恰好返回 502，又会怎样？
2. 为什么 `relay` 和 `notice` 这两种 effect 必须严格按顺序执行，而 `delivery` 不需要？提示：`delivery` 的 key 是 Ticket ID，一个 Ticket 内部的顺序由谁保证？
3. `Effects.enqueue()` 在冲突时不更新 `seq`。如果改成更新 `seq`，`relay` 的顺序会受什么影响？
4. 第 5 节的崩溃表里，“准备命令跑到一半”那一行标了风险。你会怎样修改 `prepareDirectory()`，让重启后能区分“准备好了”和“准备到一半”？
