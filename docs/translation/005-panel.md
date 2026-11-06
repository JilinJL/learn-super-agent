---
title: "005 面板"
upstream: "docs/005-panel.md"
---
# 005 面板 {#_005-panel}

<UpstreamBanner kind="translation" />

在 DeepSeek Harness Web 侧边栏中打开 **Superagent** 来监督智能体。面板优先展示需要人处理的工作，其次是系统健康状况和历史。本文以 [000 设计哲学](./000-philosophy) 到 [004 Prompt](./004-prompts) 为基础。

## 三个问题 {#three-questions}

打开面板，就能按以下顺序回答三个问题：

1. 现在有什么需要我处理吗？
2. 系统是否健康，是否在做正确的事？
3. 一项工作从 Trigger（触发）经 Eval（评估）到 Ticket（工单）的历史是怎样的？

## 标签页 {#tabs}

标签页按工作流程排列：**Overview**、**Source**、**Trigger**、**Eval**、**Execution** 和 **Settings**。在仓库和账号设置成功之前，Overview 会显示缺少什么，并链接到相应的设置。

| 标签页 | 显示内容 |
| --- | --- |
| Overview | 需要处理的 Ticket、系统问题、过去 24 小时的活动计数，以及 Executor（执行器）负载。每个区块都链接到对应的详情页 |
| Source | Source（来源）状态、设置问题和非零计数。被过滤的 Trigger 和被丢弃的消息与 Overview 使用相同的 24 小时窗口 |
| Trigger | 按 Subscribed、Evaluating、New Triggers in 24 h 或 All Threads 过滤的 Thread（线程）。每个 Thread 显示其 Trigger（最新的在前）、Decision（决定）和 Subscription（订阅） |
| Eval | Decision 及其理由和匹配的规则 |
| Execution | Executor 状态、Pause processing（暂停处理），以及按 Open、Pending、Working、Waiting for a Trigger 或 Ended 过滤的 Ticket。Ticket 详情显示操作、授权、等待中的 Input（输入）、Subscription 和 Assignment（派工） |
| Settings | Sources、Eval、Execution、Prompts 和 Deployment。每组都包含它的保存历史 |

### 查看单条记录 {#reading-individual-records}

被丢弃的消息链接到它的 Ticket；没有 Ticket 时，链接到它的 Thread。Source 页面会说明是它的会话消失了，还是 Source 不再监听该会话。

仍归某个 Executor 负责的人类跟进会标记为 **Delivered to Ticket**，不经过 Eval。Thread 还会显示交回理由和仅用于上下文的 Subscription。**Evaluate again** 可以把这条跟进发送到 Eval，或者重试一条没有有效判断的 Trigger：被其 Source 过滤的、Eval 不可用的，或者已投递但既没有非停止类 Decision、也没有 Executor 确认的消息。

Ticket 详情显示起始 Trigger、Decision 及其理由、范围和 Policy（策略）版本。Assignment 和次要详情折叠在即时操作下方。Input 投递失败，或 Ticket 在 blocked 或 failed Report（报告）之后等待人处理时，可以使用 **Retry**。已结束的 Ticket 显示 **Pull request merged** 或 **Stopped by a person** 这样的结果。

## 设置分组 {#settings-groups}

- **Sources：** 每个 Source 一张卡片，包含它的开关、字段和已验证的账号信息。GitHub 还为新 Issue、pull request、评论和默认分支 CI 提供全部接收开关。轮询和读取上限位于 Advanced 下。
- **Eval：** Policy 版本和规则，之后是 **On each Source** 和 Eval 设置。每个 Source 标签页包含它的允许名单、成员同步、准入表和机器人列表。同步在启动时以及点击 **Sync now** 时运行。准入表区分接收范围、发送者成员身份，以及消息是否在对智能体说话。Eval 设置选择接单模式、超时和研判模型。
- **Execution：** worker 模型、并发数、目录根、准备命令和被禁止的命令。点击某个可用变量，会把它插入准备命令。
- **Prompts：** **Edit** 修改团队段落、内置部分和 skill。**Full prompt** 显示组装后的文本，并将其与已保存的文本或默认内容比较。**History** 列出各个版本。被编辑过的内置部分会标记为已更改，并且可以重置；模板会列出它们必需的占位符。

  升级时，如果某个被覆盖的默认内容发生变化，它会被标记为 **Default updated**（默认内容已更新）。面板在团队文本上方比较新旧默认内容。如果旧的默认内容没有被记录，则改为比较团队文本与新的默认内容。选择 **Keep my text** 或 **Use the new default**。已被移除的部分的覆盖会列在标签栏下方，并在下次保存时丢弃。
- **Deployment：** 启动问题（带 **Check again**）、状态目录和机器资源上限。保存的上限无需重启即可生效。DeepSeek Harness 的 Plugin Manager 提供同一个页面。

## 搜索 {#search}

页头的搜索可以按文本、id、Feishu 消息 id 或存储的链接（例如 GitHub 评论 URL）查找 Trigger。原始消息中没有的 Feishu 链接，只有在宿主于当前进程生命周期内读取它之后才能被搜索到。

搜索还可以按 `#12` 或 GitHub URL 这样的引用查找 Thread，按标题或匹配的 Thread 查找 Ticket。

## 原则 {#principles}

1. **聚焦重要的事。** 每个元素都要回答三个问题之一，否则就移除。只有当一个数字会改变监督者的行动时，它才出现。
2. **精确的定义。** 分类要有可检验的定义，互不重叠且覆盖所有情况，就像 Ticket 阶段那样。标签说明这一行在等谁、需要什么，而不是内部状态码。
3. **每个概念只放一处。** Source 状态属于 Source；Thread 和 Trigger 属于 Trigger；Decision 属于 Eval；Ticket 属于 Execution。设置按其所配置的概念分组。Overview 汇总这些页面并链接过去，而不是变成又一个详情视图。
4. **领域结构。** 面板使用领域术语。内部标识符只出现在折叠的详情中；能解析出名称时，用名称代替标识符。
5. **诚实的状态。** 计数等于它所链接列表的长度，任何状态都不与其他事实矛盾。
6. **默认安静。** 健康状态不占额外空间。问题必须可以处理；一次偶发的网络错误不够格。需要人处理的行直接提供对应操作。页面说明保持在一句话以内，更多细节放进 (?) 提示框。破坏性操作需要确认。
7. **一致的控件。** 使用 DeepSeek Harness 的设计 token 和控件行为。同样的信息在整个面板中应当呈现一致。每个设置区块只有一个保存栏，仅在存在改动、正在保存或保存失败时显示。
