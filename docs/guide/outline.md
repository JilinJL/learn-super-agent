# 大纲与进度

教程分三部分、11 章，外加附录。每章写明对应的上游文档和源码，方便对照阅读。

**11 章已全部成文，附录四页齐备。** 导读和 03 适合第一次读；01～11 按顺序构成完整的一条线。原文收录和中文译文已覆盖 28 篇上游文档，`examples/mini-superagent/` 有一个可运行的最小复刻（9 个测试），真实编码执行器还没有接入。

状态：✅ 已成文 · ✍️ 写作中 · 📋 只有提纲。这里的状态表示内容写作进度，示例代码的实现范围见本页下方。

## 第一部分 · 理念与模型

先建立心智模型：它想解决什么问题，用哪几个概念描述这个问题，一个请求怎样流过这些概念。

| 章 | 内容 | 对应上游 | 状态 |
| --- | --- | --- | --- |
| [01 设计哲学：注意力预算](./01-philosophy) | 核心原则"占用最少的人类注意力"。它怎样推导出 agent 的行为约束（只在被请求时行动、只在必要时说话）和设计约束（少概念、少设置）。运维者的责任 | <Doc page="000-philosophy">000</Doc> | ✅ |
| [02 领域模型：十个概念](./02-domain-model) | Source、Trigger、Thread、Eval、Mandate、Ticket、Assignment、Subscription、Channel、Policy。每个概念守什么规则、为什么必须存在。上游"被拒绝的概念"表逐条讲解 | <Doc page="001-domain">001</Doc> | ✅ |
| [03 一个请求的一生](./03-request-lifecycle) | 主线章节。跟着一条 `@agent 修一下这个 bug` 评论，从 GitHub 通知走到 PR 合并，每一步落到具体的类和方法 | <Doc page="001-domain">001</Doc> <Doc page="003-execution">003</Doc> <Doc page="007-architecture">007</Doc> | ✅ |

## 第二部分 · 机制

逐个拆开主线上的关键机制。

| 章 | 内容 | 对应上游 | 状态 |
| --- | --- | --- | --- |
| [04 授权：谁能让 agent 干活](./04-authorization) | Gate 与 Assessment 两层；explicit / inferred 强度；准入表；接单模式 `off`/`observe`/`auto`；Mandate 的创建、撤回、失效与重新校验。用场景表推演 `gate()` 的每个分支 | <Doc page="002-authorization">002</Doc> | ✅ |
| [05 执行：Ticket 如何被做完](./05-execution) | Ticket 阶段表与 `ticketStage()`；Executor Session 与目录；worker 槽位与并发；后台任务的 30 分钟规则；PR 跟踪与结束条件；跟进的归属与交回 | <Doc page="003-execution">003</Doc> | ✅ |
| [06 可靠性：持久化副作用与恢复](./06-reliability) | "先存再做"的 Effects 队列；Outbox 与消息顺序；重试与退避；重启恢复；暂停处理。为什么 Engine 全同步、一个命令一个事务 | <Doc page="003-execution" anchor="failure-and-recovery">003</Doc> <Doc page="007-architecture" anchor="effects">007</Doc> | ✅ |
| [07 Prompt：两个角色的分工](./07-prompts) | 主 Session（orchestrator）只路由，执行器 Session（worker）只干活。system prompt 的拼装顺序与优先级；团队可编辑的三个段落；逐段注释 `dispatch.md`、`work.md`、`communication.md` | <Doc page="004-prompts">004</Doc> + [prompts 译文](/translation/prompts/dispatch) | ✅ |
| [08 面板：只显示需要人的事](./08-panel) | 面板要回答的三个问题；"健康状态不占空间"；计数必须等于它链接的列表长度。把注意力预算用到 UI 上 | <Doc page="005-panel">005</Doc> | ✅ |

## 第三部分 · 代码与扩展

| 章 | 内容 | 对应上游 | 状态 |
| --- | --- | --- | --- |
| [09 代码架构：Engine 与端口](./09-architecture) | 核心类与胶水代码的划分；Engine 的五个内部部件和单向依赖；端口接口（`Policy`、`Assessor`、`Executor`、`Outbox`）；按角色 `Pick` 的 Engine 视图；Store 与 SQLite。附源码阅读顺序 | <Doc page="007-architecture">007</Doc> | ✅ |
| [10 扩展：新增一个 Source](./10-extending) | 按上游 Cookbook 走一遍：把 webhook 事件映射成 Trigger、定义 Channel、声明 Policy 片段和执行变量。讲清 `SourceKind` 的每个可选能力 | <Doc page="008-cookbook">008</Doc> | ✅ |
| [11 动手：最小复刻](./11-build-your-own) | `examples/mini-superagent/` 已实现核心流程和测试（9 个测试全通过），用 GitHub CLI 收发评论，Assessor 和 worker 暂用 stub | — | ✅ |

## 附录

| 页面 | 内容 | 状态 |
| --- | --- | --- |
| [术语表](/appendix/glossary) | 中英对照，链接到首次讲解的章节 | ✅ |
| [源码索引](/appendix/source-map) | 按目录列出主要文件做什么、在哪章讲 | ✅ |
| [被拒绝的设计](/appendix/rejected-designs) | 上游各文档里"没有这样做"的决定汇总，附理由 | ✅ |
| [版本与许可](/appendix/about) | 锁定的上游版本、MIT 许可、如何同步上游更新 | ✅ |

## 最小示例做到哪一步了 {#example-status}

`examples/mini-superagent/` 已有可运行的核心模型。需要 Node.js 24 或更高版本，在项目根目录执行：

```bash
cd examples/mini-superagent
npm test
```

连接 GitHub 的运行命令、账号要求和实现边界，见该目录中的 `README.md`。

| 部分 | 当前实现 |
| --- | --- |
| 数据与状态 | SQLite 持久化、Trigger 去重、Thread 内串行 Eval、Ticket 与 Subscription、跟进投递 |
| 授权 | 基于发送者名单和 `@` 的 explicit Gate；正文不能改变权限 |
| 副作用 | 事务内入队、提交后执行、失败退避、待执行操作的重启恢复 |
| GitHub 接口 | 通过 `gh api` 轮询 Issue / PR 的普通评论；发送回复时用隐藏标记检查是否已发出 |
| 自动化验证 | 已有 9 项核心流程测试，覆盖重复输入、权限检查、事务回滚、重试、跟进和部分重启场景 |
| Assessor 与 worker | 当前为 stub：按规则判断接单，打印任务输入并返回模拟结果 |

接下来还需要完成：

- 为示例接入真实模型和 coding agent CLI：创建独立 worktree，实际修改代码、验证并开 PR。
- 持久化 GitHub 轮询游标，补充停机期间消息的恢复逻辑；目前游标只在内存中，重启后默认从当前时间开始轮询。
- 在测试仓库中验证真实 GitHub 收发、执行器中断恢复和 PR 交付；现有测试使用 FakeSource 和模拟 worker。
- 将示例测试接入 CI；目前 GitHub Actions 只构建和部署文档站点。
- 完成仓库首次提交、配置 Git remote，并验证 GitHub Pages 首次发布。

飞书、`observe` / `auto`、面板、PR 跟踪等能力属于最小示例暂时舍弃的范围，详见 [第 11 章的目标与范围](./11-build-your-own#scope)。

## 写作约定

- **每章开头**写明前置章节和对应上游文档，然后用一个 `::: tip 带着这些问题读` 块列出三四个具体问题。正文按问题组织，每个小节开头用一句引用块提出这一节要回答的问题，章末回顾时回到这些问题。
- **重要源码贴进正文。** 关键函数用 ```` ```ts:no-line-numbers ```` 代码块原样摘录，逐行加中文注释；上游原有的英文注释保留，无关的行用 `// …` 省略。代码块下方用 `<Src>` 给出完整文件的锁定链接。次要的位置（一个调用点、一个工具名）才只给链接。
- **插图分两种。** 讲直觉、讲隐喻的图用 AI 生图（统一风格：扁平矢量、米白底、靛蓝/青绿/琥珀三色、同一个机器人角色、图中不出现文字），放在 `docs/public/images/`。需要精确表达调用顺序、状态转换的图用 Mermaid。一章通常一张生图，Mermaid 按需。
- **引用上游文档**用 `<Doc page="002-authorization" anchor="strength">`，同时链接译文和原文。
- **不复述**：上游已经说清楚的规则直接链接过去，教程只写上游没写的东西：动机、规则之间的关系、具体场景、代码对应关系。
- **准确优先**：教程里关于行为的每条断言都要能在上游文档或源码里找到依据，找不到的标注为推测。贴出的代码必须与锁定 commit 一致。
- **每章结尾**留三四道思考题，答案能在上游文档或源码里找到。
