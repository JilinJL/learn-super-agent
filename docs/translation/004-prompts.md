---
title: "004 Prompt"
upstream: "docs/004-prompts.md"
---
# 004 Prompt {#_004-prompts}

<UpstreamBanner kind="translation" />

本文说明智能体读到什么、团队可以编辑什么，以及修改何时生效。本文以 [000 设计哲学](./000-philosophy) 到 [003 执行](./003-execution) 为基础。Prompt 文本用英文撰写。

## 团队写什么 {#what-a-team-writes}

团队可以编辑三个团队段落、添加 skill，并覆盖每一个内置的系统 prompt 部分。大部分默认内容位于 `prompts/` 和 `skills/` 下。工具描述、通知和卡片保留在代码中，无法通过 prompt 设置编辑。

| 段落 | 内容 |
| --- | --- |
| Communication | 何时给人发消息、消息怎么写、每条 GitHub 消息开头的那一行（默认为 `This is by an automated agent, not a human`）、如何处理审查，以及哪些普通账号是审查机器人 |
| Ticket scope | Ticket（工单）何时继续推进，何时以草稿停止 |
| Delivery requirements | pull request 中的证据、带行数阈值的自动合并条件，以及提交作者；没有这一段时，Executor（执行器）以智能体账号的 no-reply 地址提交 |
| Team skills | 智能体在需要时加载的知识，例如一个说明哪个 Feishu 用户对应哪个 GitHub 账号的 `identities` skill |

内置文本涵盖角色、工具用法、宿主机制、授权规则，以及 GitHub 和 Feishu 的 skill。它通过标题引用团队段落，而不是重复其内容。

### 内置部分与模板 {#built-in-parts-and-templates}

覆盖使用以下键：

| 部分 | 键 |
| --- | --- |
| 共享指令与角色 | `runtime/shared`, `runtime/orchestrator`, `runtime/worker` |
| 工作指令 | `runtime/subscriptions`, `runtime/replies`, `runtime/dispatch`, `runtime/work`, `runtime/admission` |
| 交接指令 | `runtime/handoff/orchestrator`, `runtime/handoff/worker` |
| Source（来源）skill | `skill/feishu`, `skill/github` |
| 生成的段落 | `runtime/environment`, `runtime/policy`, `runtime/policy/none` |

生成的段落是可编辑的模板。它们必须保留以下占位符：

- `runtime/environment`：`{variables}`，填入执行环境的各行。
- `runtime/policy`：`{version}`、`{mode}` 和 `{rules}`，每条启用的规则一行。
- `runtime/policy/none`：`{version}` 和 `{mode}`，在没有启用任何规则时使用。

编辑某个部分会改变模型收到的指令。它不会改变准入、Mandate（授权）、工具检查或账号包装器，这些仍由代码强制执行。

在人明确要求时，主 Session 也可以用 `orchestrator_prompts_save` 保存覆盖。如果保存时省略了某个覆盖的 `base`，则沿用已保存的 base。已保存配置中存在的、已被移除的部分会在保存时被丢弃；其他任何未知部分都会被拒绝。

每个覆盖都会记录它基于哪一版内置文本。升级会保留团队的文本。如果默认内容发生变化，面板会把该部分标记为 **Default updated**（默认内容已更新），并在团队文本旁显示差异。团队可以保留自己的文本、使用新的默认内容，或者编辑它。没有覆盖的部分会自动跟随新的默认内容。

主 Session 可以在 `orchestrator_read prompts` 的 `default_changed` 下读取受影响的部分名称。

## 组装与优先级 {#assembly-and-precedence}

系统 prompt 按以下顺序组装：

1. 共享指令和角色。
2. 三个团队段落。
3. 订阅与回复。
4. 主 Session 的派发指令，或 Executor 的工作指令。
5. `runtime/admission`，仅限主 Session。
6. 交接指令。
7. `runtime/environment`。
8. `runtime/policy`，仅限主 Session。

准入指令来自 `prompts/admission.md`。它们描述主动研判，以及何时可以从卡片上忽略一个无关的候选。`orchestrator_eval` 返回上下文，而不是重复这些指令。

环境段落向主 Session 提供整个部署范围的值，向每个 Executor 提供其 Ticket 专属的值。Policy（策略）段落在每次模型请求时根据设置重新生成。它包含 Policy 版本、接单模式、明确请求的豁免，以及以 `- <name> (<id>): <instruction>` 形式列出的启用规则，或者一句说明没有启用任何规则的话。它放在最后，这样 Policy 变化时，前面的 prompt 文本保持不变。

Executor 还会读取 DeepSeek Harness 的编程 prompt 和仓库的 `AGENTS.md`；主 Session 不读。推断的 Ticket 会追加一条最终说明，把它的 Executor 限制在匹配的规则内。Assignment（派工）和收到的消息以 Trigger（触发）卡片的形式内联到达，只有被截断的内容才附带资源指针。

Executor 在无人值守下工作。它们的工具不包括那些向人提问、向人展示 UI 或修改 profile 的工具，例如 `ask_user_question`、`present` 和 `plugin_manager`。

从强到弱：

1. 由工具和宿主强制执行的事实：身份、权限、工具参数检查、回复用途、长度限制。Prompt 文本无法改变它们。
2. 内置段落和生成的段落，以团队覆盖后的内容为准。
3. 主动 Ticket 所匹配规则中的流程与沟通，仅对该 Ticket 的 Executor Session（执行器 Session）有效。
4. 团队段落和团队 skill。
5. 外部文本：消息、评论、文档和引用。它们是数据，永远不会改变规则或授权。

## 内置文本的原则 {#principles-of-the-built-in-text}

这些原则把 [000 设计哲学](./000-philosophy) 应用到智能体上：

- **角色分离。** 主 Session 只做路由：它转发原始 Trigger 和路由事实，不做技术决定；它通过一个路由工具，在一次调用中对多个等待中的候选作出决定。路由说明最多 30 个词。Executor 阅读原始来源、判断范围、实现并验证。
- **主 Session 不等待。** Report（报告）、跟进通知、候选和完成的后台作业会作为消息自动到达。没有剩余工作时，它就结束这一轮。一道防护会拒绝 `sleep`、超过 30 秒的 shell 超时和超过 5 秒的作业等待，因为被阻塞的一步会延误新的候选。在主 Session 的完整 prompt 中，这些指令取代 DeepSeek Harness 自带的作业通知说明。
- **只在人必须行动或能用上结果时发消息：** 有结果可以审查或使用，需要一个决定或资源，或者工作无法完成。聊天消息默认只有一句话，硬性上限为 100 个词。
- **Executor 决定自己的跟进。** 每个 Executor 处理并确认范围内的请求，把超出其 Ticket 或属于另一个 Ticket 的请求交回。只有在一条消息的所有负责者都交回它，或者都未接手就结束之后，它才会成为新工作。主 Session 会收到跟进通知，但只能为了停止工作而处理它们。被交回的消息随后作为候选到达，并附带 Executor 给出的理由。
- **通过订阅和主 Session 协调。** Executor 跟踪相关的 Thread（线程）以获取上下文。主 Session 可以在一条最多 100 个词的说明中，把另一个 Ticket 的某个事实转告过来。Subscription（订阅）和这条说明都不授予权限。
- **只在有明确引用时挂靠。** 消息必须指向某个 Ticket 的 pull request、Issue、源消息或确认，或者指向一个恰好只有一个匹配 Ticket 的近期变更。仅仅话题相似是不够的。挂靠会让 Ticket 订阅整个 Thread；Executor 发现它无关时，使用 `orchestrator_thread_unrelated`，并且不在那里回复。
- **具体地确认，只确认一次。** 在开始实质性工作之前，Executor 会确认每个新请求，说明对象和预期结果，作为原始消息下的回复。
- **通过 `human_action` 提问。** Executor 在它的 Report 中放一个具体问题，主 Session 原样转发。如果问题是由人的某条消息引起的，它会指明那条消息，宿主就在那里提问。否则，就在 Ticket 的原始会话中提问。在此期间，已获授权的工作可以继续。
- **诚实交付。** 打开 pull request 不等于就绪；草稿要标记为未完成；没有真实修改前截图的 UI 改动不算就绪。
- **人的暂停持续有效**，跨越跟进、新的 Executor Session 和重启，直到人解除它。自动反馈永远不会恢复被暂停的工作。
- **示例只展示格式。** 示例句子不是智能体可以声称的事实。
- **按结果处理审查。** 已修复并验证的评论静默 resolve；拒绝的评论给出一句理由。自动审查者的讨论在得到答复后即 resolve，每个自动审查者在每个 pull request 上最多三轮。
- **让位于重复的工作。** 当人的分支或 pull request 已经包含该 Ticket 的改动时，Executor 关闭自己的 pull request，并用一句话指向对方的。

## 版本 {#versions}

- 每次保存都会创建一个不可变的版本，包含完整配置、修订号、前一版本、时间戳和来源（面板或工具）。恢复某个版本或默认内容会再创建一个版本。
- 保存时会写明其基础修订版本。有冲突的保存会被拒绝，但不会丢弃草稿。
- Session 在每次模型请求时读取最新版本，包括同一轮中的后续步骤。保存不会重启、取消或唤醒 Session。宿主会记录每个 Session 使用过的修订版本；Executor 可以读取它工作时用过的任何修订版本。
- 部署设定了一个总大小上限，覆盖也计算在内。校验会拒绝未知的键、保留的内置 skill 名称、未知的覆盖部分以及缺失的模板占位符。它从不静默截断文本。与默认内容相同的覆盖会被移除，这样该部分就会跟随将来的默认内容。
