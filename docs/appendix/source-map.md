# 源码索引

按目录列出上游 `src/` 下的全部 111 个文件（共 15587 行），链接锁定在 commit `8c32a9d`。"行数"是该 commit 下 `wc -l` 的结果。"说明"大多译自文件头部的文档注释，"本教程"列指向主要讲它的章节，"—"表示教程没有专门讲。上游自己的模块表见 <Doc page="007-architecture" anchor="modules">007 · Modules</Doc>。

想从零理解核心模型，可以先看 [11 动手：最小复刻](/guide/11-build-your-own)：它用约 470 行代码复刻了下表中标了 11 的那些文件的核心规则，`examples/mini-superagent/README.md` 里有逐文件的对照表。

## `src/core/`：可复用的领域核心

不依赖任何 Source、Policy 或 Executor 的具体实现。上游的依赖规则要求这一层只依赖自己（<Doc page="007-architecture" anchor="dependency-rules">007 · Dependency rules</Doc>）。

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/core/model.ts" label="model.ts" /> | 353 | 领域模型：概念及其不变量，与具体 Source、Policy、Executor 无关 | [02](/guide/02-domain-model)、[11](/guide/11-build-your-own#step-1) |
| <Src path="src/core/ports.ts" label="ports.ts" /> | 134 | 核心依赖的端口：Policy、SourceScope、Assessor、Executor、Outbox、Repositories | [09](/guide/09-architecture#ports) |
| <Src path="src/core/engine.ts" label="engine.ts" /> | 270 | Engine：核心的唯一入口，每个命令一个事务；以及按角色划分的接口 | [03](/guide/03-request-lifecycle)、[09](/guide/09-architecture#engine-parts)、[11](/guide/11-build-your-own#step-3) |
| <Src path="src/core/part.ts" label="part.ts" /> | 80 | Engine 各部件的基类与共享配置 | [09](/guide/09-architecture#engine-parts) |
| <Src path="src/core/intake.ts" label="intake.ts" /> | 63 | 接收 Trigger、记录关联、Subscription 扇出、排队等 Eval | [03](/guide/03-request-lifecycle#step-2-intake)、[11](/guide/11-build-your-own#step-3) |
| <Src path="src/core/evals.ts" label="evals.ts" /> | 340 | Thread 级别的 Eval，以及它们产生的 Decision | [03](/guide/03-request-lifecycle#step-3-gate)、[04](/guide/04-authorization)、[11](/guide/11-build-your-own#step-4) |
| <Src path="src/core/tickets.ts" label="tickets.ts" /> | 423 | Ticket 从接单到结束的生命周期、Subscription 与 Input | [03](/guide/03-request-lifecycle#step-5-accept)、[05](/guide/05-execution)、[11](/guide/11-build-your-own#accept) |
| <Src path="src/core/assignments.ts" label="assignments.ts" /> | 140 | Executor 和 worker 关于 Assignment 的报告 | [03](/guide/03-request-lifecycle#step-8-report)、[05](/guide/05-execution) |
| <Src path="src/core/replies.ts" label="replies.ts" /> | 95 | Engine 发往 Channel 的消息，每种按允许它的规则 | [03](/guide/03-request-lifecycle#step-6-ack) |
| <Src path="src/core/stage.ts" label="stage.ts" /> | 26 | Ticket 阶段分类与是否可重试（docs/003） | [05](/guide/05-execution#stages) |
| <Src path="src/core/reasons.ts" label="reasons.ts" /> | 38 | Decision、被过滤的 Trigger、结束的 Assignment 的理由代码与英文模板 | — |
| <Src path="src/core/errors.ts" label="errors.ts" /> | 61 | 面向用户的错误码，分为 missing 与 refused 两类，附英文消息模板 | [03](/guide/03-request-lifecycle#step-4-route) |
| <Src path="src/core/ids.ts" label="ids.ts" /> | 5 | 由内容派生的稳定 id，相同输入得到相同 id | [03](/guide/03-request-lifecycle#step-1-trigger)、[11](/guide/11-build-your-own#step-1) |
| <Src path="src/core/memory.ts" label="memory.ts" /> | 50 | 内存仓储实现，用于测试和临时的 Engine 实例 | [09](/guide/09-architecture#store) |
| <Src path="src/core/index.ts" label="index.ts" /> | 10 | 核心的导出：模型、端口、Engine 与内存仓储 | — |

## `src/` 根目录

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/policy.ts" label="policy.ts" /> | 242 | 设置 schema、研判结果校验、Gate、重新校验、Policy 版本 | [03](/guide/03-request-lifecycle#step-3-gate)、[04](/guide/04-authorization)、[11](/guide/11-build-your-own#step-4) |
| <Src path="src/admission.ts" label="admission.ts" /> | 13 | 每个接收范围的准入表，把消息分为明确请求、推断候选或忽略 | [04](/guide/04-authorization#admission) |
| <Src path="src/index.ts" label="index.ts" /> | 27 | 插件入口：挂载 Runtime，部署账号变化时重启 | [09](/guide/09-architecture#runtime) |
| <Src path="src/deployment.ts" label="deployment.ts" /> | 131 | 插件配置，启动时校验仓库访问与 CLI 身份 | — |
| <Src path="src/setup.ts" label="setup.ts" /> | 39 | 结构化的启动与配置错误，附运维者能修正它的设置位置 | — |
| <Src path="src/kv.ts" label="kv.ts" /> | 58 | KV 记录的类型化键，按唯一写入它的组件分组 | [09](/guide/09-architecture#store) |
| <Src path="src/limits.ts" label="limits.ts" /> | 11 | 宿主 schema 与面板表单共享的校验上限 | — |
| <Src path="src/navigation.ts" label="navigation.ts" /> | 23 | 确认 Session 目录已加载后，在工作区中打开一个 DSH Session | [08](/guide/08-panel) |

## `src/app/`：应用层与胶水代码

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/app/runtime.ts" label="runtime.ts" /> | 254 | 组合根与生命周期 | [09](/guide/09-architecture#runtime) |
| <Src path="src/app/passes.ts" label="passes.ts" /> | 69 | 每 2 秒或按需执行的处理轮次，驱动到期的 effect 和 Eval | [03](/guide/03-request-lifecycle#step-3-gate)、[09](/guide/09-architecture#runtime) |
| <Src path="src/app/store.ts" label="store.ts" /> | 291 | SQLite 持久化：领域聚合、KV、设置历史、Outbox | [06](/guide/06-reliability)、[09](/guide/09-architecture#store)、[11](/guide/11-build-your-own#step-3) |
| <Src path="src/app/store-read.ts" label="store-read.ts" /> | 81 | 给视图、工具和 Source 轮询的只读查询 | [09](/guide/09-architecture#store) |
| <Src path="src/app/migration.ts" label="migration.ts" /> | 616 | 在一个事务里把 schema 10 的数据库迁移到 schema 11，更早的版本直接拒绝 | — |
| <Src path="src/app/effects.ts" label="effects.ts" /> | 161 | 持久化的副作用队列：事务内写入，提交后执行，失败按退避重试 | [06](/guide/06-reliability#effects)、[11](/guide/11-build-your-own#step-6) |
| <Src path="src/app/outbox.ts" label="outbox.ts" /> | 52 | 基于回执与 `reply` effect 的可靠外发 | [06](/guide/06-reliability#outbox)、[11](/guide/11-build-your-own#step-6) |
| <Src path="src/app/delivery.ts" label="delivery.ts" /> | 86 | 跨 Session 重启的幂等消息投递 | [06](/guide/06-reliability#restart) |
| <Src path="src/app/assessment.ts" label="assessment.ts" /> | 282 | 主 Session 对候选的研判：转交卡片、提供有界的上下文读取、记录结果 | [03](/guide/03-request-lifecycle#step-4-route)、[04](/guide/04-authorization#two-layers)、[11](/guide/11-build-your-own#step-4) |
| <Src path="src/app/sessions.ts" label="sessions.ts" /> | 352 | 两种角色 Session 的生命周期、prompt 与工具装配、消息投递、预算重试跟踪 | [07](/guide/07-prompts) |
| <Src path="src/app/prompts.ts" label="prompts.ts" /> | 247 | 有版本的角色 prompt、行为策略与运维 skill | [07](/guide/07-prompts)、[07](/guide/07-prompts#versions) |
| <Src path="src/app/context.ts" label="context.ts" /> | 33 | 内置 prompt 段落、角色策略与对话记录投影 | [07](/guide/07-prompts#assembly) |
| <Src path="src/app/skill-files.ts" label="skill-files.ts" /> | 32 | 从磁盘加载打包的内置 skill 与 prompt 模板 | [07](/guide/07-prompts) |
| <Src path="src/app/role-models.ts" label="role-models.ts" /> | 44 | 给新建的 Session 设置各角色的默认模型，不改 DSH 的全局默认 | — |
| <Src path="src/app/retry-health.ts" label="retry-health.ts" /> | 91 | 从 Session 事件流中投影出正在进行的模型预算重试等待 | — |
| <Src path="src/app/notices.ts" label="notices.ts" /> | 129 | 经 effect 队列发给主 Session 的通知与转发 | [07](/guide/07-prompts) |
| <Src path="src/app/cards.ts" label="cards.ts" /> | 96 | 面向模型的 Trigger、Ticket、Thread、Decision 卡片，全文留在可读资源后面 | [07](/guide/07-prompts) |
| <Src path="src/app/resources.ts" label="resources.ts" /> | 308 | `orchestrator_read` 的分页资源，大段正文在被请求前不进 prompt | [07](/guide/07-prompts#tools) |
| <Src path="src/app/links.ts" label="links.ts" /> | 71 | Source 消息链接解析与候选卡片组装 | — |
| <Src path="src/app/cache.ts" label="cache.ts" /> | 27 | 按总字符数限制大小的 LRU 缓存，用于分页资源快照和飞书链接 | — |
| <Src path="src/app/settings.ts" label="settings.ts" /> | 267 | 分块设置校验、乐观并发保存、暂停处理、Source 策略同步 | [04](/guide/04-authorization#policy-version)、[06](/guide/06-reliability#pause) |
| <Src path="src/app/settings-history.ts" label="settings-history.ts" /> | 91 | 已保存设置版本之间的结构化差异，供面板显示 | [08](/guide/08-panel) |
| <Src path="src/app/versions.ts" label="versions.ts" /> | 34 | 编号快照存储，当前版本指针放在 KV 表里 | [07](/guide/07-prompts#versions) |
| <Src path="src/app/setup.ts" label="setup.ts" /> | 99 | 探测仓库与账号 CLI、配置 worker 执行环境与命令包装、跟踪初始化状态 | [05](/guide/05-execution#variables) |
| <Src path="src/app/execution-environment.ts" label="execution-environment.ts" /> | 46 | 准备命令和 worker 可见的执行环境变量，从不包含凭据 | [05](/guide/05-execution#variables) |
| <Src path="src/app/source-context.ts" label="source-context.ts" /> | 72 | 给每个 Source kind 的受限运行上下文，不直接暴露 Store 或 Engine | [10](/guide/10-extending) |
| <Src path="src/app/http.ts" label="http.ts" /> | 247 | 仅限回环地址、强制同源的管理 HTTP 路由 | [08](/guide/08-panel) |
| <Src path="src/app/api.ts" label="api.ts" /> | 52 | 面板与宿主路由之间的类型契约，只含类型 | [08](/guide/08-panel) |
| <Src path="src/app/tools/main.ts" label="tools/main.ts" /> | 301 | 主 Session 的工具：路由、研判、回复、修改设置与 prompt | [03](/guide/03-request-lifecycle#step-4-route)、[07](/guide/07-prompts#tools) |
| <Src path="src/app/tools/executor.ts" label="tools/executor.ts" /> | 105 | 执行器 Session 的工具：读上下文、确认、管理 Thread、交回超出范围的消息、报告 | [05](/guide/05-execution#followups)、[07](/guide/07-prompts#tools) |
| <Src path="src/app/tools/tool.ts" label="tools/tool.ts" /> | 35 | 两种 Session 共用的工具原语与 schema | [07](/guide/07-prompts#tools) |
| <Src path="src/app/views/overview.ts" label="views/overview.ts" /> | 80 | 概览：系统问题、等人处理的 Ticket、执行器负载、24 小时流量 | [08](/guide/08-panel) |
| <Src path="src/app/views/tickets.ts" label="views/tickets.ts" /> | 87 | Ticket 列表与详情、Mandate 依据格式化、执行器负载 | [08](/guide/08-panel) |
| <Src path="src/app/views/threads.ts" label="views/threads.ts" /> | 95 | Thread 列表与时间线、跨实体搜索、Decision 列表 | [08](/guide/08-panel) |
| <Src path="src/app/views/sources.ts" label="views/sources.ts" /> | 70 | Source 状态：健康、24 小时 Trigger 计数、最近被过滤或丢弃的消息 | [08](/guide/08-panel) |
| <Src path="src/app/views/settings.ts" label="views/settings.ts" /> | 43 | 设置视图：版本化的配置块、各 Source 表单与 Policy 元数据、执行环境 | [08](/guide/08-panel) |
| <Src path="src/app/views/records.ts" label="views/records.ts" /> | 210 | Trigger、Ticket、Thread、Decision 与 Channel 链接的共享投影 | [08](/guide/08-panel) |
| <Src path="src/app/views/text.ts" label="views/text.ts" /> | 36 | 视图中纯文本预览与无 HTML 的 Markdown 的清理和格式化 | [08](/guide/08-panel) |

## `src/executor/`

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/executor/dsh.ts" label="dsh.ts" /> | 673 | DSH 执行器：每个 Ticket 一个持久的 worker Session 和目录；`WorkerSlots` | [03](/guide/03-request-lifecycle#step-7-launch)、[05](/guide/05-execution)、[11](/guide/11-build-your-own#step-5) |
| <Src path="src/executor/background.ts" label="background.ts" /> | 165 | worker 的后台 shell 任务与子 agent，随 Assignment 一起停止 | [05](/guide/05-execution#background) |

## `src/sources/`

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/sources/kind.ts" label="kind.ts" /> | 115 | `SourceKind` 插件契约：配置 schema、表单字段、Policy 集成、Channel、Thread 上下文读取 | [10](/guide/10-extending#source-kind) |
| <Src path="src/sources/registry.ts" label="registry.ts" /> | 138 | 已安装的 kind 与实例，以及 Engine 的 `SourceScope` 实现 | [10](/guide/10-extending) |
| <Src path="src/sources/host.ts" label="host.ts" /> | 67 | Source 插件与应用之间的接口；面板也引用它，所以不能引入 Node 专用模块 | [10](/guide/10-extending) |
| <Src path="src/sources/poll.ts" label="poll.ts" /> | 40 | 轮询辅助：已订阅的 Thread、不会重叠的游标、适合定时器的延迟 | — |
| <Src path="src/sources/admission-context.ts" label="admission-context.ts" /> | 42 | 研判时加载的有界 Thread 消息窗口 | [04](/guide/04-authorization) |
| <Src path="src/sources/github.ts" label="github.ts" /> | 459 | GitHub kind 定义、通知与仓库轮询循环、插件入口 | [03](/guide/03-request-lifecycle#step-1-trigger)、[10](/guide/10-extending)、[11](/guide/11-build-your-own#step-2) |
| <Src path="src/sources/github-trigger.ts" label="github-trigger.ts" /> | 108 | GitHub 的 Issue、PR、评论、review 与 CI 变化 → Trigger | [03](/guide/03-request-lifecycle#step-1-trigger)、[11](/guide/11-build-your-own#step-2) |
| <Src path="src/sources/github-channel.ts" label="github-channel.ts" /> | 52 | 以 agent 账号发 Issue/PR 评论和 review 回复，带标记防止重复 | [03](/guide/03-request-lifecycle#step-6-ack)、[11](/guide/11-build-your-own#step-2) |
| <Src path="src/sources/github-pull.ts" label="github-pull.ts" /> | 105 | PR 绑定、生命周期观察与结束时的 IM 通知 | [03](/guide/03-request-lifecycle#step-8-report)、[05](/guide/05-execution#ending) |
| <Src path="src/sources/github-read.ts" label="github-read.ts" /> | 177 | 只读的仓库、对话与 CI 查询，供研判和 worker 使用 | — |
| <Src path="src/sources/feishu.ts" label="feishu.ts" /> | 139 | 飞书 kind 定义、策略同步与插件入口 | [10](/guide/10-extending) |
| <Src path="src/sources/feishu-trigger.ts" label="feishu-trigger.ts" /> | 89 | 飞书实时事件、历史消息与话题回复 → Trigger | — |
| <Src path="src/sources/feishu-channel.ts" label="feishu-channel.ts" /> | 35 | 飞书外发：话题内的 bot 回复，以及聊天链接 | — |
| <Src path="src/sources/feishu-loops.ts" label="feishu-loops.ts" /> | 267 | 飞书后台循环：实时事件流、历史回填、群名刷新、已订阅话题轮询 | — |
| <Src path="src/sources/feishu-read.ts" label="feishu-read.ts" /> | 171 | 按 Trigger 限定范围的飞书上下文读取，读到的消息不进 Intake | — |
| <Src path="src/sources/feishu-image.ts" label="feishu-image.ts" /> | 55 | 下载飞书消息里的图片，研判时作为模型可见的附件 | — |

## `src/infra/` 与 `src/client/`

### `src/infra/`：子进程、环境与工具

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/infra/commands.ts" label="commands.ts" /> | 115 | 以部署配置的账号运行 gh、lark-cli、git 的子进程封装 | — |
| <Src path="src/infra/environment.ts" label="environment.ts" /> | 157 | 进程环境与 CLI 包装：把 git、gh、lark-cli 绑定到部署账号，拦截不允许的命令 | [05](/guide/05-execution#variables) |
| <Src path="src/infra/health.ts" label="health.ts" /> | 35 | 组件健康登记，显示在概览和 Source 状态页 | [08](/guide/08-panel) |
| <Src path="src/infra/paths.ts" label="paths.ts" /> | 20 | 从源码树或编译后的 `lib/` 解析打包资源的路径 | — |
| <Src path="src/infra/text.ts" label="text.ts" /> | 20 | 字数统计与字符串模板，用于 IM 消息长度限制 | — |

### `src/client/`：面板前端（React）

面板的设计原则见 [08 面板](/guide/08-panel)。

| 文件 | 行数 | 说明 | 本教程 |
| --- | --- | --- | --- |
| <Src path="src/client/index.tsx" label="index.tsx" /> | 58 | 浏览器端插件入口：注册侧栏图标、管理面板和插件管理器配置页 | [08](/guide/08-panel) |
| <Src path="src/client/app.tsx" label="app.tsx" /> | 188 | 面板外壳：顶栏的全局搜索与术语表、导航标签、当前路由视图 | [08](/guide/08-panel) |
| <Src path="src/client/route.ts" label="route.ts" /> | 67 | 类型化的面板路由、路由解析，以及存在 sessionStorage 里的浏览历史 | [08](/guide/08-panel) |
| <Src path="src/client/api.ts" label="api.ts" /> | 140 | 同源的管理 API 客户端与轮询 hook | [08](/guide/08-panel) |
| <Src path="src/client/provider.tsx" label="provider.tsx" /> | 108 | 面板共享的 React context、状态轮询、重启检测与操作 hook | [08](/guide/08-panel) |
| <Src path="src/client/overview.tsx" label="overview.tsx" /> | 103 | 概览页：等人处理的 Ticket、系统问题、24 小时流量、执行器负载 | [08](/guide/08-panel) |
| <Src path="src/client/trigger.tsx" label="trigger.tsx" /> | 27 | Trigger 状态页：按订阅和 Eval 状态筛选的 Thread 列表 | [08](/guide/08-panel) |
| <Src path="src/client/thread.tsx" label="thread.tsx" /> | 176 | Thread 详情页：无缝分页的 Trigger 时间线、Decision、订阅的 Ticket、关联的 Thread | [08](/guide/08-panel) |
| <Src path="src/client/ticket.tsx" label="ticket.tsx" /> | 198 | Ticket 详情页：阶段与操作、Mandate、已投递和未投递的 Input、订阅的 Thread、Assignment | [08](/guide/08-panel) |
| <Src path="src/client/eval.tsx" label="eval.tsx" /> | 225 | Eval 状态页（Decision 日志）与 Eval 设置组（规则、各 Source 准入、研判设置） | [08](/guide/08-panel) |
| <Src path="src/client/execution.tsx" label="execution.tsx" /> | 127 | 执行状态页（进行中的 Ticket 与暂停开关）与执行设置组（容量、工作区环境） | [08](/guide/08-panel) |
| <Src path="src/client/source.tsx" label="source.tsx" /> | 156 | Source 状态页（健康、被过滤的 Trigger、被丢弃的回复）与 Source 设置卡片 | [08](/guide/08-panel) |
| <Src path="src/client/settings.tsx" label="settings.tsx" /> | 38 | 设置标签页外壳：在各阶段设置、Prompt 与部署之间切换 | [08](/guide/08-panel) |
| <Src path="src/client/settings-kit.tsx" label="settings-kit.tsx" /> | 278 | 设置页共享的 context、草稿 hook、表单控件、Source schema 字段渲染与配置历史 | [08](/guide/08-panel) |
| <Src path="src/client/draft.tsx" label="draft.tsx" /> | 203 | 乐观的设置草稿：存在 sessionStorage 里，并与并发保存做三方合并 | [08](/guide/08-panel) |
| <Src path="src/client/deployment.tsx" label="deployment.tsx" /> | 98 | 部署设置视图，面板设置页与 DSH 插件管理器配置页共用 | [08](/guide/08-panel) |
| <Src path="src/client/prompts.tsx" label="prompts.tsx" /> | 295 | Prompt 设置组：段落与 skill 编辑、完整 prompt 预览与差异、版本历史 | [07](/guide/07-prompts#versions)、[08](/guide/08-panel) |
| <Src path="src/client/prompt-config.ts" label="prompt-config.ts" /> | 78 | 编辑 prompt 段落与 skill、计算折叠行差异的纯函数 | [08](/guide/08-panel) |
| <Src path="src/client/rows.tsx" label="rows.tsx" /> | 140 | Ticket、Thread、Decision 的共享列表行，Source 事实标签，自动消息折叠 | [08](/guide/08-panel) |
| <Src path="src/client/widgets.tsx" label="widgets.tsx" /> | 147 | 依赖上下文的共享组件：页头、时间戳、Markdown 渲染、确认操作 | [08](/guide/08-panel) |
| <Src path="src/client/controls.tsx" label="controls.tsx" /> | 250 | 不依赖上下文的 UI 基础组件，样式取自 `--dsw-alias-*` 变量 | [08](/guide/08-panel) |
| <Src path="src/client/marks.ts" label="marks.ts" /> | 57 | 领域状态到 UI 状态标记的纯映射 | [08](/guide/08-panel) |
| <Src path="src/client/text.ts" label="text.ts" /> | 63 | 本地化、理由格式化、消息标记清理与相对时间 | [08](/guide/08-panel) |
| <Src path="src/client/markdown.ts" label="markdown.ts" /> | 42 | 报告和问题所用的 Markdown 子集解析与网址识别，从不解释原始 HTML | [08](/guide/08-panel) |
| <Src path="src/client/locales.ts" label="locales.ts" /> | 770 | 中英双语界面词典与术语表分组，术语跟随 `docs/001-domain.md` | [08](/guide/08-panel) |
| <Src path="src/client/client.css" label="client.css" /> | 382 | 面板样式（文件没有头部注释，说明取自文件名） | [08](/guide/08-panel) |
| <Src path="src/client/css.d.ts" label="css.d.ts" /> | 5 | `?raw` 样式文本导入的类型声明 | — |
## `tests/`

上游 `tests/` 下有 59 个测试文件（48 个 `*.spec.ts`、11 个 `*.spec.tsx`），文件名和被测模块对应；另有 `tests/fixtures/` 下 6 个共享夹具。理解某个机制最快的方式往往是读它的测试，例如 <Src path="tests/core-engine.spec.ts" label="core-engine.spec.ts" />、<Src path="tests/policy.spec.ts" label="policy.spec.ts" />、<Src path="tests/stage.spec.ts" label="stage.spec.ts" />、<Src path="tests/effects.spec.ts" label="effects.spec.ts" />。上游的测试索引见 <Doc page="007-architecture" anchor="tests">007 · Tests</Doc>。
