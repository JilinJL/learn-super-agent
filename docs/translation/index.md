# 原文译文

这一部分是上游仓库 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 文档的中文翻译，对应 commit `8c32a9d`。结构和上游一一对应：README、SETUP、九篇编号文档、全部 prompt 和两个 skill。每页顶部都有链接，可以切换到[英文原文](/upstream/readme)对照。

翻译只求准确，不加解释。解释、图示和代码走读放在[拆解教程](/guide/)里。

建议的阅读顺序和上游一致：编号文档按顺序读，每篇只依赖前面已经出现的概念。

- [README](./readme) · [SETUP](./setup)
- [000 设计哲学](./000-philosophy)
- [001 领域模型](./001-domain)
- [002 授权](./002-authorization)
- [003 执行](./003-execution)
- [004 Prompt](./004-prompts)
- [005 面板](./005-panel)
- [006 部署](./006-deployment)
- [007 架构](./007-architecture)
- [008 Cookbook：新增 Source](./008-cookbook)

## 翻译约定

**领域术语保留英文。** Source、Trigger、Thread、Eval、Mandate、Ticket 这些词在上游的代码、工具名、面板和文档里是同一套词，保留英文才能和代码对上。每篇第一次出现时括注中文，中文名取自上游 [001 领域模型](./001-domain#glossary) 的术语表，例如 Ticket（工单）。

**代码、命令、配置值不翻译。** 行内代码、代码块、工具名（`orchestrator_route`）、取值（`observe`、`ready`）、环境变量、文件路径保持原样。代码块里的注释也不改。

**Prompt 原文是写给模型的英文。** 译文帮助理解 prompt 在说什么。agent 实际读到的是英文，引用时以原文为准。

**标题锚点与英文一致。** 每个标题都带 `{#英文锚点}`，所以 `#strength` 这样的链接在译文和原文里指向同一节。

## 术语对照

| 英文 | 中文 | 说明 |
| --- | --- | --- |
| Agent | 智能体 | dsh-superagent 运行的自动化成员 |
| Main Session | 主 Session | 评估 Trigger、接单派工、回复的 Session，代码里叫 `orchestrator` |
| Executor Session | 执行器 Session | 一个 Ticket 的执行 Session，代码里叫 `worker` |
| Source | 来源 | 事件流 |
| Trigger | 触发 | 来自 Source 的一条不可变事件 |
| Thread | 线程 | 按时间排列的 Trigger |
| Correlation | 关联 | 只补充上下文，不路由 |
| Channel | 渠道 | Thread 的写入端 |
| Policy | 策略 | 有版本的接单规则 |
| Policy version | 策略版本 | |
| Eval | 评估 | 把一批 Trigger 变成 Decision 的过程 |
| Gate | 准入 | Eval 的确定性第一层 |
| Assessment | 研判 | Eval 中模型的判断 |
| Decision | 决定 | Eval 的结果 |
| Mandate | 授权 | accept 授予的内容 |
| Ticket | 工单 | 一个获授权的工作单元 |
| Assignment | 派工 | Ticket 与一个 Executor 实例的绑定 |
| Subscription | 订阅 | Ticket 与 Thread 的关系 |
| Fan-out | 扇出 | |
| Executor | 执行器 | |
| Execution environment | 执行环境 | |
| Report | 报告 | |
| Attention | 待人工决定 | |
| Disposition | 去向 | |
| Input | 输入 | |
| Scope | 范围 | |
| Strength | 强度 | explicit 明确 · inferred 推断 |
| allowed list | 允许名单 | |
| admission table | 准入表 | |
| accept mode | 接单模式 | `off` · `observe` · `auto` |
| follow-up | 跟进 | |
| hand back | 交回 | |
| attach | 挂靠 | 主 Session 把消息路由到它明确指向的已有 Ticket |
| dismiss | 不再提示 | 面板操作，取自面板中文文案 |
| setup | 初始化 | 部署时的仓库与账号检查 |
| addressed | 指向智能体 | `mention` 或 `direct` |
| prepare command | 准备命令 | |
| worker slot | worker 槽位 | |
| stored work | 持久化的待办工作 | 先写库、后执行的副作用 |
| Pause processing | 暂停处理 | 面板操作 |
| operator | 运维者 | 部署并负责这个 agent 的人 |
