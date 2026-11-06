# 被拒绝的设计

你自己设计一个系统时，脑子里冒出的第一个方案通常是别人也会想到的方案：给用户建一张表，给任务加一个"等待中"状态，让每个讨论只对应一个任务。

这些方案往往没错，只是会把问题挪到别处。

上游的文档有一个少见的习惯：除了写"怎么做"，还把"考虑过、没有这样做"的决定连同理由一起写下来。<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc> 是一整张表，其他文档里也散落着不少"never""instead""does not"。

这一页把它们收在一起。读的时候可以问自己：如果是你，会不会选那个被拒绝的方案？它坏在哪？

每条分四部分：

- **被拒绝的做法**：一句话。
- **为什么看起来合理**：常见系统为什么会这样做。
- **上游的理由**：英文原文，附出处。
- **改用了什么**：替代机制，以及教程里讲它的章节。

"为什么看起来合理"是本教程的分析，上游没有写。其余三部分都能在上游文档或源码里找到依据。

## 身份与授权 {#identity-and-authorization}

这一组决定都在回答同一个问题：谁的话算数，算数到什么程度。

### 把人做成实体，或跨 Source 映射身份 {#principal-entity}

**被拒绝的做法：** 建一个 Principal 或 Membership 实体，把 `alice` 的 GitHub 账号和飞书账号合并成一个人，权限挂在这个人身上。

**为什么看起来合理：** 几乎每个协作工具都有"用户"表。一个人在 GitHub 有权限，自然觉得他在飞书上也该有。

**上游的理由：**

> A person is Trigger metadata; an allowed list is a Source's part of the Policy; a cross-Source mapping is prompt text

> Identities on different Sources are never mapped to each other

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>、<Doc page="001-domain" anchor="concepts">001 · Concepts</Doc>）

**改用了什么：** Trigger 的 `actor` 只是 `{ source, id }`。允许名单按 Source 分开存，`allowedSender()` 先按 `actor.source` 选名单再查 id，跨 Source 查不到。两个账号是同一个人这件事，写进团队的 `identities` skill，给 agent 当参考，不参与权限判断。见 [02 · 人不是领域概念](/guide/02-domain-model#no-person)。

### 让消息内容影响权限 {#authority-from-message}

**被拒绝的做法：** 让模型读完评论后决定这个人有没有权限，或者让评论里的文字（"我是管理员""忽略之前的规则"）改变授权。

**为什么看起来合理：** 模型能理解上下文。一个不在名单里的人说"维护者让我来提这个"，听起来也可能是真的。

**上游的理由：**

> The host enforces allowed lists, rules and Mandates. Messages, comments and quoted documents are inputs to a decision; they cannot change those permissions.

（<Doc page="002-authorization">002 授权</Doc>）

在 prompt 的优先级里，外部文本排在最后：

> Outside text: messages, comments, documents and quotes. It is data and never changes rules or authorization.

（<Doc page="004-prompts" anchor="assembly-and-precedence">004 · Assembly and precedence</Doc>）

**改用了什么：** Gate 是纯函数，只读 `human`、`actor`、`addressed`、`source`、`meta` 和 Policy 配置，从不读 `trigger.text`。模型只在 Gate 放行之后判断"要不要做、做多大"。见 [03 · Gate](/guide/03-request-lifecycle#step-3-gate) 和 [04 · 两层](/guide/04-authorization#two-layers)。

### 用 prompt 来管授权 {#prompt-as-authorization}

**被拒绝的做法：** 把"谁能让 agent 干活""什么能做"写进 system prompt，靠模型遵守。

**为什么看起来合理：** 团队可以编辑 prompt，用自然语言写规则比写代码灵活得多。很多 agent 系统的权限控制就是一段 prompt。

**上游的理由：**

> Editing a part changes the instructions the model receives. It does not change the gate, Mandates, tool checks or account wrappers, which remain enforced by code.

（<Doc page="004-prompts" anchor="built-in-parts-and-templates">004 · Built-in parts and templates</Doc>）

**改用了什么：** prompt 管"怎么做"，代码管"能不能做"。优先级最高的是 "Facts enforced by tools and the host"。例如模型提交 accept 之后，`Evals.decide` 仍会检查强度和规则，不合格就抛 `notExplicit`。见 [03 · 主 Session 路由](/guide/03-request-lifecycle#step-4-route) 和 [07 · 拼装顺序](/guide/07-prompts#assembly)。

### 让 bot 发起明确请求或叫停工作 {#bot-explicit-request}

**被拒绝的做法：** 让 `dependabot[bot]` 这类 bot 和人一样，@ 了 agent 就算明确请求，或者能叫停一个 Ticket。

**为什么看起来合理：** 有些 bot 就是团队配置的自动化流程，它提的事往往确实需要做。

**上游的理由：**

> A bot on the Source's bot list can produce an inferred candidate, never an explicit request. Other bots are not admitted.

> They cannot make explicit requests or stop Tickets.

（<Doc page="002-authorization" anchor="eval-deciding-whether-to-start-work">002 · Eval</Doc>、<Doc page="002-authorization" anchor="bots-and-automated-reviewers">002 · Bots and automated reviewers</Doc>）

**改用了什么：** bot 走单独的 `machineGate`，最多得到 inferred 强度，`MandateBasis` 的 `via: 'bot'` 分支注释写着 "never an explicit request or a stop"（<Src path="src/core/model.ts" lines="121-122" />）。inferred 的工作要在 `auto` 模式下命中启用的规则才会被接下。见 [04 · 接单模式](/guide/04-authorization#accept-mode)。

### 执行器声明"人要求我停" {#executor-declares-stop}

**被拒绝的做法：** 执行器读到有人说"别做了"，自己以"人叫停"的名义结束 Ticket。

**为什么看起来合理：** 执行器离对话最近，它最先看到这条消息。绕一圈主 Session 显得多余。

**上游的理由：**

> Only Eval decides the strength of an end

> A person saying "stop" in a Thread is an ordinary Trigger, and Eval decides stop. An Executor cannot declare that a person asked it to stop.

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>、<Doc page="002-authorization" anchor="revalidation-before-resume">002 · Revalidation before resume</Doc>）

**改用了什么：** 执行器能报告 `dropped`，结束者记为 `executor`。以 `human` 结束只有两条路：Eval 的 stop（要求 explicit 强度，否则记为 `stopNotExplicit`），或者面板上的停止按钮。以 `human` 结束的 Ticket 不会再被唤醒，所以这扇门必须窄。见 [02 · 被拒绝的概念](/guide/02-domain-model#rejected)。

### 在 Subscription 上做准入检查 {#admission-on-subscriptions}

**被拒绝的做法：** 订阅的 Thread 上来了消息，先查发送者在不在名单里，不在就不送给 Ticket。

**为什么看起来合理：** Gate 检查了发起人，跟进消息不查，看起来像留了个后门。

**上游的理由：**

> A Subscription covers the whole Thread; the Mandate separates authorization from context

> This delivery bypasses the gate and grants no new authority. Each Ticket remains limited by its Mandate.

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>、<Doc page="002-authorization" anchor="subscriptions-continuing-existing-work">002 · Subscriptions</Doc>）

**改用了什么：** 授权和上下文分开。reviewer 不在名单里，他的意见照样送到执行器，因为它只是上下文。执行器做的事仍然受 Mandate 范围约束，超出范围就交回主 Session 重新过 Gate。如果在 Subscription 上查名单，reviewer 的意见就进不来了。见 [03 · Review 意见](/guide/03-request-lifecycle#step-9-followup)。

### 把"何时可以合并"写进 Policy {#merge-in-policy}

**被拒绝的做法：** 把"PR 小于 200 行且有人批准才能自动合并"这类条件做成 Policy 的一部分，和允许名单放在一起。

**为什么看起来合理：** 它听起来像一条权限规则：agent 被允许做什么。

**上游的理由：**

> A condition on what the Executor may do with its own result, such as when it may merge, does not decide who may authorize work. It is part of the agent's instructions, not of the Policy.

（<Doc page="002-authorization" anchor="policy-version">002 · Policy version</Doc>）

**改用了什么：** 合并条件写在团队 prompt 段落 Delivery requirements 里。Policy 只管"谁能发起工作"。这样改合并条件不会改变 Policy 版本，不会让正在运行的 Eval 作废。见下一组的 [合并决策逻辑](#merge-decision-logic)。

## Eval 与路由 {#eval-and-routing}

这一组决定回答：一条消息进来后，由谁、在什么时候决定它去哪。

### Eval 自己安排延时 Trigger {#eval-schedules-waits}

**被拒绝的做法：** Eval 判断"现在还不该做，过两小时再看"，然后给自己安排一个定时器。

**为什么看起来合理：** "Issue 开了 24 小时没人认领就接手"是很自然的需求，放在做判断的地方似乎最顺手。

**上游的理由：**

> A condition that needs waiting is an ordinary Source, so Eval never depends back on Sources

> Waiting conditions belong to Sources. A condition such as "no assignee for N hours" would be a Source that waits and checks again itself; Eval never waits.

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>、<Doc page="002-authorization" anchor="revalidation-before-resume">002 · Revalidation before resume</Doc>）

**改用了什么：** 依赖方向保持单向：Source → Trigger → Eval。需要等待的条件由一个 Source 自己计时，条件满足时产生一个普通的 Trigger。001 对 Source 的定义里已经写了 "including conditions that only hold over time"。见 [10 · 先映射到领域](/guide/10-extending#map-first)。

### Eval 有"等待中"或"已撤销"状态 {#eval-waiting-states}

**被拒绝的做法：** 给 Eval 加状态机：`waiting`（等模型回复）、`revoked`（规则变了）、`paused` 等。

**为什么看起来合理：** 工作流系统通常给每个步骤配一套状态，方便在面板上显示和恢复。

**上游的理由：**

> Waiting belongs to Sources; an Eval that runs out of time queues its Triggers again, or ends `unavailable`

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** Eval 只有两种结局：给出一个 Decision，或者超时重排。连续超时两次后，第三次记 `unavailable`（`REQUEUES = 2`，<Src path="src/core/evals.ts" lines="19" />）。Policy 变化时，运行中的 Eval 也是记 `unavailable` 并立即重排（`reassess`，<Src path="src/core/evals.ts" lines="223-230" />）。状态少，重启后要恢复的东西也少。见 [04 · Eval 未完成](/guide/04-authorization#unavailable)。

### 每个 Thread 最多一个活跃 Ticket {#one-ticket-per-thread}

**被拒绝的做法：** 一个 Issue 同时只能有一个进行中的 Ticket，新消息要么并入它，要么等它结束。

**为什么看起来合理：** 路由变得极简单：消息在哪个 Thread，就给那个 Thread 的 Ticket。也天然避免了重复。

**上游的理由：**

> One Thread can carry several independent pieces of work; the assessment avoids duplicates from the Ticket list

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** `Thread.subscriptions` 是数组。重复由研判避免：模型拿到的 `Candidate.tickets` 包含 Thread 上全部 Ticket，包括已结束的，注释写着 "for duplicate judgement"（<Src path="src/core/ports.ts" lines="36-37" />）。见 [02 · Thread](/guide/02-domain-model#thread)。

### "追加到 Ticket"作为一种 Decision {#append-decision}

**被拒绝的做法：** 每条新消息都进 Eval，Eval 的结果里多一种 `append`：把消息追加到某个已有 Ticket。

**为什么看起来合理：** 所有消息走同一条路，逻辑统一，每条消息都有一个 Decision 可查。

**上游的理由：**

> Appending is Subscription fan-out and needs no Eval

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** 人在 Ticket 自己的 Thread 上发的消息，由 Intake 直接扇出给 Ticket，不进 Eval，也不产生 Decision。`DecisionKind` 里没有 append（<Src path="src/core/model.ts" lines="190" />）。这样跟进不用排队等模型，"谢谢"这类消息也不会触发一次判断。见 [03 · Intake](/guide/03-request-lifecycle#step-2-intake)。

### 会路由的 Correlation {#routing-correlation}

**被拒绝的做法：** 一条消息同时属于 Issue 和 PR 两个 Thread，就让这两个 Thread 之后的消息互相转发给对方的 Ticket。

**为什么看起来合理：** 两个 Thread 显然相关，让对应的 Ticket 都看到对方的消息似乎更周全。

**上游的理由：**

> Subscriptions route; Correlation only adds context

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** 路由只看 `Thread.subscriptions`。`Thread.correlated` 只在 Intake 里写入，只有面板的 Thread 视图读它。执行器想看另一个 Thread，要显式调用 `followForContext` 订阅它，而且那是只读上下文。见 [02 · Correlation](/guide/02-domain-model#correlation)。

### 按话题相似度把消息挂到 Ticket {#attach-by-similarity}

**被拒绝的做法：** 主 Session 看到一条新消息和某个 Ticket 的话题相近，就把它挂到那个 Ticket 上。

**为什么看起来合理：** 模型擅长判断语义相似，这样能把散落在各处的讨论自动归拢。

**上游的理由：**

> A message must point to a Ticket's pull request, Issue, source message or acknowledgement, or to a recent change with exactly one matching Ticket. Topic similarity alone is not enough.

（<Doc page="004-prompts" anchor="principles-of-the-built-in-text">004 · Principles of the built-in text</Doc>）

**改用了什么：** 挂靠要有明确指向。挂靠会让 Ticket 订阅整个 Thread，所以一次误挂的代价是之后那个 Thread 的消息都会送过来。执行器发现挂错了，用 `orchestrator_thread_unrelated` 取消订阅。注意这条规则写在 prompt 里，由模型遵守（推测：代码层面没有检查"是否有明确指向"）。见 [07 · 两个角色](/guide/07-prompts#roles)。

## Ticket 与执行 {#tickets-and-execution}

这一组决定回答：工作的状态由谁说了算，出问题时系统收紧到什么程度。

### Ticket 状态跟随 DSH Session {#ticket-follows-session}

**被拒绝的做法：** Session 在跑，Ticket 就是"进行中"；Session 结束，Ticket 就"完成"。

**为什么看起来合理：** 少维护一份状态，不会出现两边不一致。

**上游的理由：**

> A Ticket can be handed off, resumed, or run by several Executors, so it defines its own state

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** Ticket 和执行器之间隔了一层 Assignment。重试、重启会开新的 Assignment，Ticket 不变。面板上的阶段由 `ticketStage()` 从 Ticket 自己的字段算出。有 PR 的 Ticket 甚至不由执行器的 `ready` 结束，而是等 PR 关闭。见 [02 · Ticket 与 Assignment](/guide/02-domain-model#ticket-assignment) 和 [05 · 阶段](/guide/05-execution#stages)。

### 从报告的自由文本推断"在等人" {#infer-waiting-from-text}

**被拒绝的做法：** 读执行器报告的正文，看里面有没有问题，有就把 Ticket 标为"等人回答"。

**为什么看起来合理：** 执行器本来就会在报告里写"需要你确认一下"，再加一个字段显得重复。

**上游的理由：**

> The classification needs structured facts; the Executor asks through a structured field

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** 执行器提问必须填 `orchestrator_report` 的 `human_action`，报告状态是固定的枚举（<Src path="src/app/tools/executor.ts" lines="78-80" />）。`ticketStage()` 和 `waitsForPerson()` 只读这些字段。分类靠猜的话，面板的计数就没法保证等于列表长度。见 [05 · 阶段](/guide/05-execution#stages) 和 [08 · 原则](/guide/08-panel#principles)。

### 执行器失败时锁住它的全部工具 {#lock-tools-on-failure}

**被拒绝的做法：** 执行器报告 `failed` 或 `blocked` 后，收回它的所有工具，防止它在出错状态下继续动手。

**为什么看起来合理：** 出错后"先停下"是常见的安全做法。

**上游的理由：**

> It would refuse a person working directly in the Session, and the report after recovery; pausing automatic input is enough

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>）

**改用了什么：** 只暂停自动输入。`Tickets.addInput` 里，CI、bot 消息和 note 这类自动输入在 `waitsForPerson` 为真时被扣住，人的消息照常送达（<Src path="src/core/tickets.ts" lines="234-245" label="tickets.ts · addInput()" />）。工具一直保留到 Ticket 结束，`Sessions.workOnly` 的注释写明 "A failed or blocked worker keeps its tools, so a person may continue it in its Session"（<Src path="src/app/sessions.ts" lines="283-296" />）。见 [06 · 重试](/guide/06-reliability#retry)。

### 宿主里写专门的合并决策逻辑 {#merge-decision-logic}

**被拒绝的做法：** 在宿主代码里判断 PR 能不能自动合并：行数、批准数、CI 状态。

**为什么看起来合理：** 合并是有风险的操作，用代码把关比让模型自己判断更可靠。

**上游的理由：**

> Auto-merge is governed by the **Delivery requirements** prompt. The host has no merge-specific decision logic.

> These instructions govern the agent, not GitHub's merge rules. To enforce approvals, require them in branch protection and dismiss stale approvals.

（<Doc page="003-execution" anchor="merging">003 · Merging</Doc>）

**改用了什么：** 合并条件写在 prompt 里，真正的强制交给 GitHub 的分支保护。宿主再写一遍，只会和分支保护的规则重复或冲突。默认 prompt 还规定执行器不以 agent 账号开启自动合并，因为 "GitHub attributes the merge to whoever enabled it"。见 [01 设计哲学](/guide/01-philosophy)。

### 把命令包装器当作安全边界 {#wrappers-not-boundary}

**被拒绝的做法：** 认为执行器用的 `gh`、`lark-cli` 包装器和被禁用的命令列表能限制它做什么。

**为什么看起来合理：** 包装器确实挡住了按名字调用的命令，看上去像一层沙箱。

**上游的理由：**

> These wrappers and directories establish defaults, not a security boundary. A worker can still execute a program by absolute path.

（<Doc page="003-execution" anchor="execution-variables">003 · Execution variables</Doc>）

**改用了什么：** 上游没有假装有隔离。执行器以运维者的 OS 用户、`danger-full-access` 运行（<Doc page="006-deployment" anchor="permissions-and-isolation">006 · Permissions and isolation</Doc>）。安全依靠的是前面几层：Gate 决定谁能发起工作，Mandate 限定范围，部署时给 agent 账号最小的仓库权限。见 [05 · 执行变量](/guide/05-execution#variables)。

### 让主 Session 等待 {#main-session-waits}

**被拒绝的做法：** 主 Session 派完工后 `sleep` 一会儿，或者长时间等一个后台任务，看看执行器有没有回报。

**为什么看起来合理：** 单人用编码 agent 时，"跑个命令等结果"是常态。

**上游的理由：**

> Reports, follow-up notices, candidates and completed background jobs arrive automatically as messages. It ends the turn when nothing remains to do. A guard refuses `sleep`, shell timeouts over 30 seconds and job waits over 5 seconds, because a blocked step delays new candidates.

（<Doc page="004-prompts" anchor="principles-of-the-built-in-text">004 · Principles of the built-in text</Doc>）

**改用了什么：** 主 Session 是事件驱动的：报告、通知和候选作为消息推进来。代码里有一个守卫，用正则识别命令位置上的 `sleep`，并拒绝超过 30 秒的超时（<Src path="src/app/sessions.ts" lines="69-81" />）。主 Session 被卡住，所有新请求都会跟着等。见 [07 · 两个角色](/guide/07-prompts#roles)。

## Policy 变化 {#policy-changes}

### Policy 变化时取消运行中的 Ticket {#cancel-on-policy-change}

**被拒绝的做法：** 团队改了规则、从名单里移除了某人、或者把接单模式从 `auto` 调回 `observe`，就立即取消所有不再符合新规则的 Ticket。

**为什么看起来合理：** 规则收紧了，按旧规则接下的工作似乎也不该再继续。

**上游的理由：**

> A cancelled change leaves half-finished work; the change is recorded and delivered instead

> A change that bears on a live Ticket, such as a change to a rule it was accepted under, is delivered to its Assignment; it does not revoke Mandates.

> Weakening a cell does not immediately stop open Tickets accepted under it. It can revoke their Mandates when they are revalidated before resuming.

（<Doc page="001-domain" anchor="rejected-concepts">001 · Rejected concepts</Doc>、<Doc page="001-domain" anchor="concepts">001 · Concepts</Doc>、<Doc page="002-authorization" anchor="admission">002 · Admission</Doc>）

**改用了什么：** 分两步处理。正在跑的 Eval 作废重排，因为它还没产生任何工作。已有的 Ticket 只收到一条 `policy-changed` Input，说明哪条规则变了、发起人是否还被允许（<Src path="src/core/tickets.ts" lines="200-208" label="tickets.ts · policyChanged()" />），由执行器决定收尾还是报告 `dropped`。真正的吊销发生在 Ticket 结束后想恢复时，`revalidate()` 按当前 Policy 重新检查一遍。见 [04 · Policy 版本](/guide/04-authorization#policy-version) 和 [04 · Mandate](/guide/04-authorization#mandate)。

## Source 与设置 {#sources-and-settings}

### 在 Source 的轮询循环里悄悄丢掉不监听的消息 {#silent-drop-in-source}

**被拒绝的做法：** Source 轮询时发现某条消息来自没在监听的群或范围，直接跳过，不交给核心。

**为什么看起来合理：** 反正不处理，早丢早省事，还少存一条记录。

**上游的理由：**

> Out-of-scope messages are stored as filtered with their reason and create no Thread. Pass messages to `receive` rather than silently dropping them in the polling loop, so the panel can explain filtering.

（<Doc page="008-cookbook" anchor="_4-what-the-source-receives-scope">008 · 4. What the Source receives: scope</Doc>）

**改用了什么：** 范围过滤放在 `Intake.receive` 里，被过滤的 Trigger 照样存下来，并记一条带原因码的 `filtered` 去向。有人问"为什么 agent 没理我"，面板上能查到。见 [03 · Intake](/guide/03-request-lifecycle#step-2-intake) 和 [10 · SourceKind](/guide/10-extending#source-kind)。

### 把能用文字描述的行为做成设置项 {#settings-for-behaviour}

**被拒绝的做法：** 为"PR 需要谁批准""什么时候在飞书上通知"这类团队习惯各加一个开关或下拉框。

**为什么看起来合理：** 设置项明确、可校验，不依赖模型的理解。

**上游的理由：**

> A default replaces a setting when one value suits almost every team. Behaviour that a team describes in words is prompt text, not a setting.

（<Doc page="000-philosophy" anchor="what-follows-for-the-design">000 · What follows for the design</Doc>）

**改用了什么：** 团队可编辑的三个 prompt 段落：Communication、Ticket scope、Delivery requirements。代价是遵守这些习惯变成了模型行为，所以上游把需要强制的部分（比如合并前的批准）交给平台本身。见 [01 设计哲学](/guide/01-philosophy) 和 [07 · 团队段落](/guide/07-prompts#team-sections)。

## 上游尚未决定的问题 {#open-questions}

<Doc page="007-architecture" anchor="open-questions">007 · Open questions</Doc> 列了两个问题。它们还没有被拒绝或采纳，这里只记下原文和它们与上面各条的关系。

> Trust: which Trigger fields are trusted, such as the Source's actor and Thread membership, and which are not, such as the body and quotes.

这和 [让消息内容影响权限](#authority-from-message) 是同一个话题。现有代码已经按这个思路做了：Gate 信任 `actor`、`human`、`addressed`，不读正文；`Trigger` 的注释写着 "`text` and `meta` are untrusted external data"。上游把它列为未决，说明这条边界还没有完整成文。

> Deployment isolation: the agent's profile on its own pinned DeepSeek Harness installation, so upgrading DeepSeek Harness elsewhere does not break it.

这和 [把命令包装器当作安全边界](#wrappers-not-boundary) 相关，但关心的是升级稳定性：agent 和运维者自己的 DSH 共用一套安装时，运维者升级可能弄坏 agent。目前上游没有给出方案。
