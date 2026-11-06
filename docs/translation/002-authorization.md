---
title: "002 授权"
upstream: "docs/002-authorization.md"
---
# 002 授权 {#_002-authorization}

<UpstreamBanner kind="translation" />

授权决定谁可以发起工作，以及这项工作可以包含什么。本文建立在 [001 领域模型](./001-domain) 之上。

宿主强制执行允许名单、规则和 Mandate（授权）。消息、评论和被引用的文档是决定的输入；它们不能改变这些权限。

## Trigger 的两条路径 {#two-paths-for-a-trigger}

### Eval：决定是否开始工作 {#eval-deciding-whether-to-start-work}

Source（来源）会记录一条消息是否在对 agent 说话：`mention` 表示提及了机器人或 agent 账号，`direct` 表示私聊消息。Gate（准入）检查发送者和这个 Source 的 Policy（策略）：

- 被允许的人对 agent 说话，构成一个明确的请求。
- 人在已有 Ticket（工单）的 Thread（线程）上的跟进，遵循下面的规则。
- 其他人类消息按其接收范围使用准入表。
- Source 机器人名单上的机器人可以产生推断候选，但永远不能构成明确请求。其他机器人不予准入。

### Subscription：继续已有的工作 {#subscriptions-continuing-existing-work}

已订阅 Thread 上的每条消息都会作为上下文到达订阅了它的 Ticket，包括来自机器人和 CI 的消息。这种送达绕过准入，也不授予任何新的权限。每个 Ticket 仍受它的 Mandate 限制。

人在某个 Ticket 自己的 Thread 上发的消息，由这个 Ticket 的 Executor（执行器）来决定如何处理。主 Session 把一条消息挂到某个 Ticket 上时也是如此。在 Executor 拥有这条消息期间，它不经过 Eval（评估），也不产生 Decision（决定）。每个 Executor 要么在它的 Ticket 范围内处理这个请求，要么把它交回，以便路由到别处。

只要 Ticket 还在途，所有权就一直持续，即使有人删除了它的 Subscription（订阅）。所有权也覆盖这样一个已结束的 Ticket：它不是被人停止的，并且这条消息正等着恢复它。

主 Session 会收到一条跟进通知。在 Executor 拥有这条消息期间，主 Session 只能应这个人的要求停止工作；accept、attach、ignore 和 requeue 都会被拒绝。stop 仍然要以下文所述的跟进强度通过准入。

### 交回与释放跟进 {#handing-back-and-releasing-follow-ups}

当一条消息要求的工作超出 Ticket 的范围，或者属于另一个 Ticket 时，Executor 会把它交回一次。Ticket 保留它的 Subscription。如果某个挂上来的 Thread 与工作无关，Executor 就交回它在那里拥有的消息。

只有在没有任何 Ticket 仍拥有一条消息之后，它才会进入一次新的 Eval。它的候选包含各个 Executor 给出的理由。准入把它当作那个 Thread 上的一条普通消息来判断，主 Session 可以接单、把它挂到别处，或者忽略它。交回一条 Ticket 并不拥有的消息，例如一条机器人消息，或者一条已经被人送去 Eval 的消息，不会排入任何队列。

Ticket 结束时，会释放它的 Executor 没有读到或没有接手的跟进。这包括从未送达 Executor 的消息，以及在它最后一次 Report（报告）或回合结束之后才送达的消息，前提是它既没有确认、没有答复，也没有交回这些消息。每条被释放的消息，在没有其他 Ticket 拥有它时进入 Eval。stop 只结束被停止的那个 Ticket 的工作。

被停止的 Ticket 不会把它的停止消息再次送去 Eval，除非另一个 Ticket 交回了这条消息。停止它的主 Session 可以把这条消息的其余部分作为新工作接单。

人可以在面板中把一条已被拥有的跟进送去 Eval。如果主 Session 随后又把它挂回一个在途的 Ticket，Executor 会再次收到它。当没有有效的判断覆盖这条消息时，面板也会提供重新评估。

### 仅作上下文的 Subscription {#context-only-subscriptions}

Executor 可以为获取上下文而关注一个相关的 Thread，例如另一个 Issue 或 pull request。那里的消息会到达 Ticket，但不授予任何权限或跟进强度。那里的人类消息不会恢复一个已结束的 Ticket，除非主 Session 挂上了来自那个 Thread 的一条消息。主 Session 发来的关于其他工作的备注也只是上下文。

没有到达任何 Ticket 的人类消息，包括其 Ticket 都已被人停止的 Thread 上的消息，走 Eval 路径。机器人消息走这条路径，与它们是否送达已订阅的 Ticket 无关。

## 强度 {#strength}

| 强度 | 情形 |
| --- | --- |
| explicit | 名单上的人对 agent 说话，或在已有 Ticket 的 Thread 上跟进；准入表中设为明确请求的格子 |
| inferred | 不在名单上的人在已有 Ticket 的 Thread 上跟进，除非他们在准入表中对应的格子是 explicit；准入表中设为推断候选的格子；Source 机器人名单上的机器人发出的、对 agent 说话的消息，或者出现在该 Source 接收全部消息之处的消息 |
| 不予准入 | 其他任何机器人的消息、准入表忽略的所有内容，以及 accept mode（接单模式）为 `off` 时的所有推断情形 |

对于不在名单上的人，explicit 的准入格子优先，即使在已有 Ticket 的 Thread 上也是如此，并且在所有接单模式下都有效。否则，他们的跟进是 inferred，在 `off` 模式下不予准入。仅为上下文而关注的 Thread 上的消息使用准入表，而不是跟进强度。

## 准入 {#admission}

每个 Source 的 Policy 都有一张准入表。它的行是接收范围：

- **飞书：** 每个已配置的群聊、机器人从中收到提及的其他群聊，以及私聊。只有在飞书卡片上把 **其他群** 设为 **仅 @** 时，才会接收其他群聊。
- **GitHub：** 新 Issue、新 pull request、评论，以及默认分支的 CI。

一行最多有三个格子。每个格子决定一条消息成为明确请求、推断候选，还是什么都不是：

| 格子 | 可选值 | 默认值 |
| --- | --- | --- |
| 在名单上，未对 agent 说话 | inferred、ignore | inferred |
| 不在名单上，对 agent 说话 | explicit、inferred、ignore | ignore |
| 不在名单上，未对 agent 说话 | inferred、ignore | ignore |

针对未对 agent 说话的消息的格子，只有在 Source 接收全部消息的地方才可用，例如设为 **全部消息** 的飞书群聊，或开启了全部接收开关的 GitHub 范围。CI 结果没有发送者，所以它那一行只提供最后一个格子。机器人消息使用机器人名单，而不是这些格子。

把“不在名单上、对 agent 说话”的格子设为 explicit，就能让那个范围内的任何人通过提及 agent 来请求工作。这对专门的支持群聊可能有用。推断候选仍取决于接单模式。跟进通常绕过这张表，只是 explicit 的格子仍然会授予明确强度。

准入表是 Policy 版本的一部分。调弱一个格子不会立即停止依据它接单的未结束 Ticket。但在这些 Ticket 恢复前重新校验时，可能会撤销它们的 Mandate。

### 机器人与自动评审者 {#bots-and-automated-reviewers}

宿主把 GitHub App、以 `[bot]` 结尾的登录名以及飞书机器人识别为机器人。Source 可以列出 `dependabot[bot]` 这样的机器人，它们的消息可以成为推断候选。这些消息要么必须对 agent 说话，要么必须发在接收全部消息的范围里。它们不能构成明确请求，也不能停止 Ticket。

使用普通账号的自动评审者，在宿主看来就是一个人。它的评论会到达已订阅的 Ticket，并产生跟进通知。团队 prompt 文本必须把这类账号标明为自动评审者。

## 路由候选 {#routing-candidates}

主 Session 用 `orchestrator_route` 路由明确候选。一次调用可以包含多个 accept、attach、stop 或 ignore 决定。每一项独立处理：某一项被拒绝或缺少字段，不会妨碍其他项执行。

推断候选通常需要完整的研判。只有一条捷径：如果它的卡片显然不涉及任何已启用的规则，例如闲聊或无关的讨论，主 Session 可以直接忽略它。Decision 会记录 `ignoredFromCard`，以便与依据规则的研判区分开。主 Session 在它的 Policy prompt 小节中读取已启用的规则。

对推断候选接单总是需要研判。对于准入没有判为 explicit 的 Trigger，直接接单会被拒绝。

## 接单模式与规则 {#accept-mode-and-rules}

接单模式是 Policy 的一部分：

| 模式 | 效果 |
| --- | --- |
| `off` | 任何推断内容都不会成为候选，例如未对 agent 说话的消息、机器人的消息，或不在名单上的人的跟进 |
| `observe`（默认） | 推断候选会被研判；正面的研判被记录为标有“would accept”的 ignore，不会接单 |
| `auto` | 对推断候选的正面研判会接下它 |

明确请求在所有模式下都有效。先从 `observe` 开始，审阅记录下来的 Decision 之后再切换到 `auto`。每次研判对每条已启用的规则恰好判断一次，无论它是否匹配。主动接单至少需要一条匹配的规则。

每条规则描述一类主动工作。Ticket 的 Mandate 会记录匹配的规则，它的 Executor 会收到这些规则的名称和指令。

对这个 Ticket 而言，规则中关于流程和沟通的要求会覆盖默认值。一条静默规则可以取消确认消息；一条评审规则可以指定合并前必需的评审者和批准。适用于每个 Ticket 的要求则应写在团队 prompt 小节里。

## Policy 版本 {#policy-version}

规则、接单模式和每个 Source 的 Policy 构成 Policy version（策略版本）。每个 Mandate 都会记录它被接单时所依据的版本。

版本变更会丢弃正在运行的 Eval，并把它们的 Trigger 重新排队。它还会向每个受影响的在途 Ticket 发送一个 policy-changed Input（输入）。这个 Input 说明是否：

- 某条匹配的规则发生了变化（附上它的新文本），或者不再适用；
- 请求者不再能发起工作；或者
- 不再接受主动工作，例如因为模式从 `auto` 改掉了。

不受影响的 Ticket 不会收到通知。这次变更不会立即撤销在途 Ticket 的 Mandate。

Source 配置与 Policy 是分开的。它控制什么进入系统：读取哪些群聊，以及一个范围是接收全部消息还是只接收提及。Mandate 会记录它的 Source 和接收范围。恢复需要 Source 仍在监听这个 Thread，但不要求它仍接收那里的每条消息。

Source 关闭期间，回复会等待。如果 Source 不再监听回复的目的地，回复就会被丢弃。

关于 Executor 可以如何处理它自己的结果的条件，例如何时可以合并，并不决定谁可以授权工作。它属于 agent 的指令，而不属于 Policy。

## 恢复与停止 {#resume-and-stop}

已结束的 Ticket 保留它的 Mandate。人在它自己的某个 Thread 上发的消息可以恢复同一项工作，无需新的 Eval 或 Decision，无论消息是谁发的。机器人和 CI 不会唤醒已结束的 Ticket。Executor 判断这个请求是否在范围之内，如果不在，就结束这一轮。

只有三种操作会改变 Mandate：accept 创建它，人的 stop 收回它，重新校验失败则撤销它。被人停止的 Ticket 保持已结束状态，不再接收任何内容。在那里请求的工作需要一次新的 accept。

### 恢复前的重新校验 {#revalidation-before-resume}

Source 必须仍在监听原来的 Thread。其余检查取决于 Mandate 的依据：

- 明确的跟进 Mandate 直接通过。
- 推断的 Mandate 需要处于 `auto` 模式，且它匹配的规则仍然启用。
- 由准入表格子准入的 Mandate，在今天的准入表和发送者成员资格下，仍必须至少获得它原来的强度。因此，把一个发送者从名单中移除，可能会撤销经由“名单上的发送者”这个格子接单的 Mandate。
- 机器人的 Mandate 要求那个机器人仍在 Source 的机器人名单上。推断的准入表 Mandate 和机器人 Mandate 还需要处于 `auto` 模式，且匹配的规则仍然启用。
- 其他 Mandate 要求发送者仍在 Source 的允许名单上。

如果重新校验失败，Ticket 保持已结束状态，不接收任何等待中的消息。每条消息都被视为没有到达任何 Ticket；如果没有其他 Ticket 拥有它，它就进入 Eval。主 Session 不会被告知它曾到达某个 worker。处理暂停之后也是如此。挂到这个 Ticket 上的操作会被拒绝，后续工作需要一次新的 accept。

- **人在 Thread 中说“stop”是一个普通的 Trigger，** 由 Eval 作出 stop 决定。Executor 不能声明某人要求它停止。
- **面板中的 Stop 是一条命令。** 它直接作用于 Ticket，并被记录为手动停止。
- **等待条件属于 Source。** 像“N 小时内没有指派人”这样的条件，应当是一个自己等待并再次检查的 Source；Eval 从不等待。

## Eval 未完成时 {#when-eval-does-not-finish}

时间限制从候选到达主 Session 时开始计算。等待送达所花的时间不计入，未送达的候选永不过期。

过期的 Eval 会把它的 Trigger 排队再试一次。连续重试两次之后，第三次过期会记录 `unavailable`。研判失败也会记录 `unavailable`；之后的 Trigger 可以启动一次新的 Eval。Policy 变更，或依据过时 Policy 作出的决定，会记录 `unavailable`，并立即在当前版本下把这一批重新排队。

`evals` 健康条目报告最近一小时内未解决的 unavailable Decision。`scripts/dsh-superagent status` 会包含这个错误。

只有当 unavailable Decision 不到 24 小时、仍是它所在 Thread 上的最新 Decision、没有被设为不再提示，并且这个 Thread 既不在排队也不在评估中时，面板才会请求人工关注。人可以重新评估这个 Trigger，或者对这个问题不再提示。
