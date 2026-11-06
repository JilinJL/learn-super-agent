---
title: "003 执行"
upstream: "docs/003-execution.md"
---
# 003 执行 {#_003-execution}

<UpstreamBanner kind="translation" />

本文跟随一个已接单的 Ticket（工单），讲它的执行、交付和恢复。本文以 [001 领域模型](./001-domain) 和 [002 授权](./002-authorization) 为基础。

## Ticket 阶段 {#ticket-stages}

每个未结束的 Ticket 只处于一个阶段，由它在等待什么决定。表格从上往下读，第一条匹配的行生效。

| 阶段 | 条件 | 面板标签 |
| --- | --- | --- |
| person / delivery | 向 Executor Session（执行器 Session）投递 Input（输入）失败；2 秒后重试，之后的间隔每次翻倍，最长一分钟；投递成功、新的 Assignment（派工）或 Ticket 结束都会清除这一状态 | Input undelivered |
| person / answer | 存在 Attention（待人工决定） | Awaiting answer |
| person / review | 最新的 Report（报告）为 `ready` | Awaiting review |
| person / blocked, failed | 最新的 Report 为 `blocked` 或 `failed`，且此后没有人的消息到达该 Ticket | Blocked · Failed |
| working / queued | 没有 Assignment，或 Assignment 尚待启动 | Queued |
| idle | 最新的 Report 为 `waiting`，或 Assignment 已结束 | Waiting for a Trigger |
| working | 其他所有情况 | Working |

`person` 阶段表示没有人的输入，Ticket 就无法继续。一条新的人类消息会把处于 `blocked` 或 `failed` 的 Ticket 重新交给它的 Executor（执行器），于是 Ticket 进入下一个匹配的阶段，通常是 `working`。

`idle` 的 Ticket 已经完成了它的这一轮，且没有待回答的问题。已订阅 Thread（线程）上的一条 Trigger（触发）可以让它继续。

## Executor {#the-executor}

每个 Ticket 会获得一个名为 `worker-<ticket id>` 的 Executor Session，以及一个以 Ticket 短名命名的目录。目录创建在配置的执行根目录下，默认为 `<stateDir>/work`。

Executor Session 以运维者的操作系统用户身份运行命令，无需审批。它们的 `dsh-superagent-worker` 预设包含工作所需的工具，并会在前台 shell 命令运行 5 秒后把它转为后台作业。这样，worker 可以在下一步就收到新消息，而不必等长命令结束。

主 Session 使用 `dsh-superagent-router`，shell 和作业等待同样限制为 5 秒，工具集更小，只用于路由。Session 保留创建时选定的预设。Worker 的 subagent 使用 DeepSeek Harness 的 `standard` 预设。

### 后台工作与 worker 槽位 {#background-work-and-worker-slots}

一轮结束时，如果仍有 shell 作业或 subagent 在运行，Ticket 会保留它的 worker 槽位，并仍处于工作状态。它不会被报告为等待，主 Session 也不会收到等待报告。作业或 subagent 完成后，会带着结果在同一个槽位中唤醒 Executor。一旦某一轮结束时没有后台工作，Executor 就照常报告等待。

每轮结束后，后台工作最多有 30 分钟完成。到达这个上限时，shell 作业被终止，Ticket 被报告为等待。报告中包含 Executor 最后说的话，以及哪些作业被终止、哪些 subagent 仍在活动。subagent 可以继续运行。Executor 会在下一轮读取被终止作业的结果。

交接给人会立即释放槽位，并让该 Report 保持生效。这适用于 `ready` Report 或提问之后（除非此后又到达了别的 Input），以及任何 `blocked` 或 `failed` Report 之后。

交接时，subagent 停止。Shell 作业，例如为审查提供的服务器，可以一直运行到 Assignment 结束。它们不占槽位，也不受 30 分钟上限的约束，之后的轮次也是如此。它们完成时不会唤醒 Executor；Executor 在下一轮读取结果。

人也可以直接在 Executor Session 里写消息来开始一轮。这一轮的后台工作遵循同样的规则。

Assignment 结束时，它的 shell 作业被终止，且不会唤醒 Session。它的 subagent 被释放，它们唤醒的任何完成轮次都会被丢弃。替代的 Assignment 及其等待中的 Input 要等这次关闭完成后才开始。

在 DeepSeek Harness 进程内停止或重启插件，走的是同一条关闭路径。尚未纳入 Session 历史的 Input 会被保留。关闭时，每个 worker 的后台工作最多等待 10 秒；进程重启则直接结束这些工作。忙碌时被中断的 Assignment 会带着一条恢复说明重新开始。

Worker 的 subagent，包括嵌套的 subagent，使用 DeepSeek Harness 的 `standard` 预设和 worker 的权限。它们只保留 worker 被允许使用的工作工具，并在 Ticket 结束时失去这些工具。在 `standard` 下，shell 命令运行 60 秒后转入后台。subagent 结束时，它的作业会被终止。

### 准备 Ticket 目录 {#preparing-a-ticket-directory}

在第一个 Assignment 之前，如果 Ticket 目录不存在，准备命令会在执行根目录中用 `sh` 运行一次，限时十分钟。没有准备命令时，worker 从一个空目录开始。

命令失败会让 Ticket 失败，并记录命令的输出。重试，或者人在该 Ticket 某个 Thread 上发的消息，会再次尝试准备。典型的命令用 `git worktree` 创建一个检出。当 pull request 分支名的最后一段路径与 Ticket 短名一致时，该 pull request 属于这个 Ticket。

### 并发 {#concurrency}

Ticket 从一次启动开始（包括准备阶段），或者从唤醒其空闲 Executor 的那次投递开始，就占用一个 worker 槽位。在活跃的一轮中，它也一直占用该槽位。

配置的并发上限作用于这些槽位，另外为人的消息或状态请求多留一个槽位。普通槽位已满时，这类唤醒可以使用这个额外槽位，并且会先于新的启动拿到下一个空闲槽位。因此，新工作不会妨碍人继续推进已有的 Ticket。

其他 Input，例如 CI 结果，要等普通槽位。启动会停在 `working / queued`，直到有空闲槽位。各次启动并发进行，所以一个慢的准备命令只会拖慢它自己的 Ticket。

### 执行变量 {#execution-variables}

准备命令和 Executor 的指令收到相同的执行变量。命令读取环境变量；Executor 在 prompt 中读取它们的值和说明。其中都不包含凭据。

| 变量 | 注册方 | 值 |
| --- | --- | --- |
| `DSH_SUPERAGENT_DIR`, `DSH_SUPERAGENT_NAME`, `DSH_SUPERAGENT_TICKET` | Executor | Ticket 的目录、短名和 id |
| `DSH_SUPERAGENT_BLOCKED_COMMANDS` | Executor | Executor 不得运行的命令 |
| `DSH_SUPERAGENT_GITHUB_REPOSITORY` | GitHub | Source（来源）监视的仓库，`owner/name` |
| `DSH_SUPERAGENT_GITHUB_ACCOUNT`, `DSH_SUPERAGENT_GITHUB_COMMIT_EMAIL` | GitHub | 智能体账号及其提交邮箱 |
| `DSH_SUPERAGENT_GITHUB_NUMBER`, `DSH_SUPERAGENT_GITHUB_PR_HEAD` | GitHub | 发起该 Ticket 的 Issue 或 pull request；如果是 pull request，还有它的 head ref |
| `DSH_SUPERAGENT_FEISHU_BOT`, `DSH_SUPERAGENT_FEISHU_CHAT` | Feishu | 机器人，以及发起该 Ticket 的会话 |

Ticket 专属的值来自它的目录和起始 Trigger。其他值来自当前的部署设置。只有面板能修改执行环境设置；发给主 Session 的文字不能改变配置的 shell 命令。

Worker 通过智能体账号的 `gh` 访问 GitHub，通过机器人的 `lark-cli` 访问 Feishu。被禁止的命令按名字调用时会失败。

这些包装器和目录建立的是默认行为，不是安全边界。worker 仍然可以通过绝对路径执行程序。

## 合并 {#merging}

自动合并由 **Delivery requirements** prompt 管理。宿主没有专门针对合并的决策逻辑。

默认情况下，Executor 从不以智能体账号启用自动合并：GitHub 会把合并记在启用它的人名下。Delivery requirements 必须指定另一个账号的 CLI 用于合并。没有指定时，由人来合并 pull request。

默认指令只在以下情况下允许自动合并：pull request 是为该 Ticket 打开的，它已就绪，所需的批准覆盖了 head commit，且增删行数合计少于 200 行。推送新的一版之前，Executor 会撤销自动合并。

没有正文的审查，例如批准，也会作为 Trigger 到达，并可以唤醒正在等待审查的 Executor。这些指令约束的是智能体，而不是 GitHub 的合并规则。要强制要求批准，请在分支保护中要求批准，并让过时的批准失效。去掉合并 CLI 或删除自动合并那一段，即可要求手动合并。

## Ticket 如何结束 {#how-a-ticket-ends}

- **就绪但没有 pull request：** `ready` Report 让 Ticket 以已完成结束。
- **无事可做：** Executor 如果发现没有需要人处理的工作，例如请求无法复现或已被取代，就报告 `dropped`。Ticket 结束且不发消息（除非匹配的规则要求发一条），之后人在它的 Thread 上发的消息会让它恢复。
### Pull request {#pull-requests}

一旦 Executor 报告了 Ticket 起源的那个 pull request，Ticket 就会跟踪它。从 Ticket 分支打开的每个 pull request，一旦由 Executor 报告或被 GitHub Source 发现，Ticket 也会跟踪。重新打开的 pull request 会再次被跟踪。

当 Ticket 自己打开的 pull request 都不再处于打开状态时，Ticket 完成。如果它没有打开过任何 pull request，则它跟踪的所有 pull request 都必须已关闭。随后它以最后一次相关关闭的结果结束，并保留它的 Subscription（订阅），这样之后人的评论可以让它恢复。

在恢复、重试或故障后恢复的工作尚未完成时，关闭不会让 Ticket 结束。如果 Executor 已确认或回答了一条归它负责的跟进，但在读到那条消息之后，既没有发出非进度类的 Report，也没有结束过一轮，关闭也要等待。之后的 `ready` Report 会在同样的 pull request 完成规则满足时结束 Ticket。

聊天类 Channel（渠道）会收到一条关于 pull request 结果的最终通知。GitHub 本身已经在 pull request 上显示了结果。移除 Ticket 对某个 pull request 的 Subscription，也会让它停止跟踪这个 pull request。

因此，“Awaiting review”指的是带有 pull request 的 `ready` Report。

### 跟进与上下文 Thread {#follow-ups-and-context-threads}

Executor 决定其 Ticket 自身 Thread 上的人类跟进。它处理范围内的请求，并把超出其范围或属于另一个 Ticket 的请求交回。一旦没有 Executor 负责这条消息，它就成为主 Session 的候选。除此之外，主 Session 只能为了按人的要求停止工作而处理这条跟进。

Session 在某一步中接收了一条 Input，并在之后报告或结束一轮，这条 Input 才算已读。Ticket 结束时，未读且未被确认、回答或交回的消息会回到 Eval（评估），见 [002 授权](./002-authorization)。已读但未采取行动的消息，例如道谢，不会回到 Eval。

只为上下文而跟踪的 Thread 仍会投递消息，但不会让 Ticket 获得人类跟进的归属，也不会恢复已结束的 Ticket。这些消息可以被独立研判。

只要有存活的 Ticket 订阅，Source 就会轮询已订阅的 Thread；在最后一条 Trigger 与订阅它的 Ticket 结束两者中较晚的时间之后，还会继续轮询两周。此后，消息只通过常规接入途径到达：GitHub 通知或 Feishu 实时事件。

## 故障与恢复 {#failure-and-recovery}

### Executor 阻塞或失败 {#executor-blocked-or-failed}

当 Executor Session 报告 `blocked` 或 `failed`，或者启动失败、出错（这会记为 `failed`）时，Ticket 不再接收自动 Input。

模型提供方或网络的暂时性故障，即 HTTP 408、429 或 5xx，或者连接被拒绝、被重置或超时，会先重试三次，退避时间逐次增长：启动会重新运行，本轮失败的 worker 会被告知继续；失败的准备命令不会重试。

进入失败状态后，CI 和机器人消息仍会记录在该 Ticket 上，但不会投递，也不会唤醒 Session。

它的工具仍然可用，所以人可以直接在该 Session 中继续。

失败的启动不会自行重试。

人的消息、之后一条既非 `blocked` 也非 `failed` 的 Report，或者一次重试，会解除这一搁置。

这一状态由存储的 Report 和 Input 推算出来，所以重启后依然保持。
### 重试 {#retry}

当未结束的 Ticket 处于 `person / delivery`、`person / blocked` 或 `person / failed` 时可用：对每种情况，补救办法都是一个新的 Assignment，它会重新启动 worker，并接收正在等待的 Input。

一旦人的消息到达了阻塞或失败的 Ticket，Executor 就已经拿到这条消息，所以 Ticket 显示为 working（失败的启动重新开始时则显示为 queued），不提供重试，除非投递这条消息失败了。

重试会结束当前 Assignment，并在同一个 Executor Session、目录、分支和 pull request 中开始一个新的 Assignment。

Executor 模型只在创建 Session 时生效；已有的 Session 保留它的模型。
### 重启 {#restart}

运行中的 Assignment 以 “host restarted” 结束；新的 Assignment 按 Ticket 从旧到新依次启动，并带有一条恢复说明，要求 Executor 在重复任何外部操作之前，先检查它的目录、git 历史和 GitHub。

处于 waiting、ready、blocked 或 failed 的 Assignment 保持原样，除非在那条 Report 之后有 Input 到达它们，这种情况下它们也会重新开始。

Session、目录、Subscription、待处理的消息以及下文的持久化的待办工作都会在重启后保留；同样保留的还有每个 Executor Session 把哪些消息纳入了历史的记录。一步在认领消息之后、调用模型之前会把消息纳入历史：被重启打断的那一轮所纳入的消息，在之后出现 Report 或本轮结束时算作已读；而一步已经认领、但在纳入历史之前被取消或出错打断的消息，算作未读。

重试或重启时，新的 Assignment 会再次收到投递给被替换 Assignment、但其 Executor Session 没有接收的消息，这些消息可能因取消或被打断的一步而丢失；仍在 Session 中等待的副本（由重启保留，或在崩溃后持久保存）会在新 Assignment 的第一条消息之前被移除，因此新的投递是唯一的副本。
### 持久化的待办工作 {#stored-work}

dsh-superagent 在作出决定之后要做的事，例如向主 Session 转交候选、跟进或报告，启动 Assignment，或投递 Input，都是先存储，后执行。

转交或投递失败时（例如无法连接到对应的 Session），会在 2 秒后重试，之后的间隔每次翻倍，最长一分钟；启动失败会让它的 Ticket 失败，除非如上所述，这是一次暂时性故障。

每类工作只有在某一项连续失败三次之后，才会在概览的系统问题中报告错误；Input 投递失败则显示在对应的 Ticket 上。

转交给主 Session 的消息保持顺序，通知也一样；一条失败会阻挡同类中排在它后面的各条。
### Source 故障 {#source-failure}

GitHub Source 单独读取每个 Issue、pull request 和 Thread：一次读取失败会把错误保留在它的 Thread 上，在下一次轮询时重新读取，并计入 Source 的错误；默认连续三次轮询失败后，Source 会报告该错误；任何一次成功的轮询都会重置计数。

智能体失去私有仓库的访问权限时，GitHub 也会返回 404，所以 404 会被重试。

被通知的 Issue 或 pull request 如果读取一直失败，会在第一次读取失败一天后被丢弃；如果 GitHub 报告它已被删除，则立即丢弃。此后它不再导致轮询失败，它的 Thread 保留错误，Source 的状态中会列出它。

它的读取位置保持不变，所以之后的通知或对其 Thread 的轮询会读到失败读取所漏掉的内容。

Feishu 事件消费者会报告每一次失败；对已订阅话题的轮询会把每次失败保留在对应的 Thread 上。

GitHub 列表或 Feishu 分页中格式错误的条目会被跳过，并计入 Source 的状态。
### Channel 故障 {#channel-failure}

外发消息先存储，再作为持久化的待办工作发送，重试的退避从 5 秒开始，每次翻倍，最长 300 秒。

一个 Ticket 发往同一会话的消息按入队顺序发出，所以它的确认会先于之后的回答或结果：如果同一 Ticket 发往同一会话的更早一条消息尚未发出，这条消息就等待，直到那一条连续失败三次并显示为问题为止。

其他 Ticket 的消息以及不属于任何 Ticket 的消息不会等它。

有失败尝试的消息在发出或被撤回之前，都算作系统问题。

只有在 Source 不再监听该会话，或 Source 答复该会话永远无法接收这条消息时，消息才会被丢弃；Source 关闭期间，消息会等待。

对于 GitHub 上已删除的 Issue 或已锁定的会话，以及 Feishu 上已撤回或 Feishu 再也找不到的消息，Source 会给出这样的答复。

回复一条已不存在的审查评论时，回复会改发到 pull request 的会话中。

被丢弃的消息保留记录，包括丢弃时间、原因以及它所属的 Ticket，因此永远不会再次入队；被丢弃的确认显示为已丢弃，而不是已发送。
### 暂停处理 {#pause-processing}

停止派发、新的 Eval、Eval 超时、Input 投递和回复；已经在进行中的启动会等到恢复处理后再继续。

Source 继续记录 Trigger，正在运行的 Executor 轮次不会被打断。

人发给已结束 Ticket 的消息会等待：暂停之后的第一轮处理会恢复该 Ticket，前提是届时它的 Mandate（授权）在 Policy（策略）下仍然成立。

进行中的 Eval 在暂停期间不会过期；它的截止时间顺延暂停的时长。
### 无效配置 {#invalid-configuration}

如果已存储的 Source 配置被其种类拒绝，该 Source 实例会被禁用。
