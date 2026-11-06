# 术语表

中文名取自上游 <Doc page="001-domain" anchor="glossary">001 · Glossary</Doc> 和面板的中文界面文案（`src/client/locales.ts`）。"首次讲解"列指向本教程里主要讲这个概念的章节。

## 领域概念

| 英文 | 中文 | 一句话 | 首次讲解 |
| --- | --- | --- | --- |
| Agent | 智能体 | dsh-superagent 运行的自动化团队成员，通过 GitHub 账号、飞书机器人等身份在 Source 上行动 | [01](/guide/01-philosophy) |
| Source | 来源 | 事件流。一个 kind 是可复用的实现，一个 instance 是它的一份配置 | [02](/guide/02-domain-model) |
| Trigger | 触发 | 来自 Source 的一条不可变事件 | [03](/guide/03-request-lifecycle#step-1-trigger) |
| Thread | 线程 | 按时间排列的 Trigger；同一 Thread 上同时最多一个 Eval | [03](/guide/03-request-lifecycle#step-2-intake) |
| Correlation | 关联 | 共享同一个 Trigger 的 Thread 之间的关系，只补充上下文 | [02](/guide/02-domain-model) |
| Channel | 渠道 | Thread 的写入端 | [03](/guide/03-request-lifecycle#step-6-ack) |
| Policy | 策略 | 有版本的接单规则，以及各 Source 的部分（谁能发起工作等） | [04](/guide/04-authorization) |
| Policy version | 策略版本 | 规则、各 Source 策略和接单模式的一个组合的标识 | [04](/guide/04-authorization#policy-version) |
| Eval | 评估 | 把一批 Trigger 变成一个 Decision 的过程 | [03](/guide/03-request-lifecycle#step-3-gate) |
| Gate | 准入 | Eval 的确定性第一层：谁能发起工作、强度多少 | [04](/guide/04-authorization#two-layers) |
| Assessment | 研判 | Eval 中模型的判断 | [04](/guide/04-authorization#two-layers) |
| Decision | 决定 | Eval 的结果：accept 接单 · stop 停止 · ignore 忽略 · unavailable 未完成 | [03](/guide/03-request-lifecycle#step-4-route) |
| Mandate | 授权 | accept 授予的东西：强度、范围、依据的 Policy 版本 | [04](/guide/04-authorization#mandate) |
| Ticket | 工单 | 一个获授权的工作单元 | [03](/guide/03-request-lifecycle#step-5-accept) |
| Assignment | 派工 | Ticket 与一个 Executor 实例的绑定：pending 待启动 · running 执行中 · ended 已结束 | [05](/guide/05-execution) |
| Subscription | 订阅 | Ticket 与 Thread 之间的多对多关系 | [03](/guide/03-request-lifecycle#step-9-followup) |
| Fan-out | 扇出 | 把已订阅 Thread 上的 Trigger 作为上下文送给 Ticket | [03](/guide/03-request-lifecycle#step-2-intake) |
| Executor | 执行器 | 运行 Assignment 的端口：每个 Ticket 一个执行器 Session 和一个目录 | [05](/guide/05-execution#executor) |
| Execution environment | 执行环境 | 执行器 Session 和准备命令运行的环境变量 | [05](/guide/05-execution#variables) |
| Report | 报告 | Assignment 向 Ticket 报告的状态：progress 进展 · waiting 等待 · ready 就绪 · blocked 受阻 · failed 失败 · dropped 无需处理 | [03](/guide/03-request-lifecycle#step-8-report) |
| Attention | 待人工决定 | Ticket 上一个等人回答的问题 | [07](/guide/07-prompts#tools) |
| Disposition | 去向 | 一个 Trigger 被过滤、评估或扇出的记录 | [03](/guide/03-request-lifecycle#step-2-intake) |
| Input | 输入 | 送给 Ticket 的上下文：扇出的 Trigger、Policy 变化、恢复、文本 | [03](/guide/03-request-lifecycle#step-2-intake) |
| Scope | 范围 | Mandate 允许的工作 | [04](/guide/04-authorization#mandate) |
| Strength | 强度 | Mandate 或 Eval 的依据有多强：explicit 明确 · inferred 推断 | [04](/guide/04-authorization#gate-walkthrough) |

## 角色与运行时

| 英文 | 中文 | 说明 |
| --- | --- | --- |
| Main Session | 主 Session | 评估 Trigger、接单派工、回复的 DSH Session；代码和 prompt 里叫 `orchestrator` |
| Executor Session | 执行器 Session | Executor 为一个 Ticket 运行的 DSH Session；代码和 prompt 里叫 `worker` |
| DSH / DeepSeek Harness | — | 运行 agent Session 的宿主，dsh-superagent 是它的一个 bundle |
| operator | 运维者 | 部署 agent 并为它负责的人 |

## 机制

| 英文 | 中文 | 说明 |
| --- | --- | --- |
| allowed list | 允许名单 | 一个 Source 上可以发起工作的身份 |
| admission table | 准入表 | 每个接收范围上，名单内外、是否 @ agent 的消息怎样处理 |
| accept mode | 接单模式 | `off` 关闭 · `observe` 观察（默认）· `auto` 自动 |
| follow-up | 跟进 | 已有 Ticket 的 Thread 上的后续消息 |
| hand back | 交回 | 执行器把超出范围的消息交还给主 Session 重新评估 |
| attach | 挂靠 | 主 Session 把一条消息路由到它明确指向的已有 Ticket |
| prepare command | 准备命令 | 第一次派工前在执行根目录里运行一次的 shell 命令 |
| worker slot | worker 槽位 | 并发限制的单位 |
| stored work / effect | 持久化的待办工作 | 先写进 SQLite、事务提交后才执行的副作用 |
| Pause processing | 暂停处理 | 面板操作：停止派发、评估、投递和回复 |
