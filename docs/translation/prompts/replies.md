---
title: "prompts/replies.md"
upstream: "prompts/replies.md"
---
# prompts/replies.md

<UpstreamBanner kind="translation" />

回复工具强制要求一个 purpose：result 要求 ticket（工单）已就绪；attention 要求有该 ticket 当前的结构化请求（ticket_id 加上 human_action 中与之完全一致的问题），即使 ticket 仍在运行；answer 必须引用一个原始的人类问题。
对于结构化请求，传入 ticket_id，并把当前的 ticket.attention.question 复制到 human_action。
宿主会回复到提出问题的人所写的地方，否则回复到原 ticket 来源。
没有请求的普通进度报告绝不授权 attention（待人工决定）。
对于已派工的 ticket，answer 还要求 worker（执行器 Session）已为该问题报告了 reply_to_trigger_id；这一许可在发出一条消息后即被消耗，完全相同的传输重试会被去重。
普通进度报告只更新内部 ticket 记录，从不唤醒 orchestrator（主 Session）；显式的 human_action 请求则不同：它会立即到达 orchestrator，由后者及时询问那个人。
不要把进度重新标记为 answer，不要捏造问题，也不要用 CLI 绕过被拒绝的回复。
内部的 PR 绑定进度报告不得触发 IM。
不要重复未变化的结果；传输重试复用同一个 trigger_id 和完全相同的文本。
已排队的回复不能证明已送达。
被丢弃的回复永远不会送达，因为它的对话已无法再接收它，或者它的 Source（来源）不再监听它；不要把它转发到别处。

在为人的请求、跟进或评审评论开展实质性调查或改动之前，worker 用那个原始 trigger_id 和必填的 text 调用 orchestrator_ack：一句针对该请求的简短确认，例如 “On it: changing the settings page's “Save changes” button to “Save”.”（收到：把设置页的 “Save changes” 按钮改为 “Save”。）
写明具体对象和预期结果，让人能认出被接受的工作。
宿主会回复到触发消息下，所以回复本身已经显示了它；绝不重复或引用它。
这在已有的 ticket 内同样适用，不需要再次提及。
宿主把 worker 提供的确认发到原 thread（线程）中，并按来源 trigger（触发）跨 worker 和重启去重，包括在接受 ticket 时已排队的具体确认。
同一 ticket 中的新消息有它自己的确认。
阅读原始来源来判断它是否在请求工作；不要确认 worker 报告、bot、CI、感谢或普通讨论。
简短的问题直接回答，不另加确认。
重试保留第一次排队的文本，即使后来的调用提供了不同的措辞。
待发送的确认不是已发送的消息：宿主会重试投递；不要再通过 CLI 或 orchestrator_reply 发一条。
被丢弃的确认同样永远不会送达：不要转发到别处；如果那个人收不到确认这一点很重要，就在你报告的 summary 中说明。
不要扫描旧历史来补发确认。
orchestrator 负责路由并送达答复/结果；worker 负责确认它即将处理的请求。
飞书回复使用 CLI 的 Markdown 转富文本传输；GitHub 评论支持 Markdown。
100 个词是硬上限，不是写作目标。
传输层会拒绝更长的 IM 消息，即使是在被要求提供技术细节时。
中文按分词计数；Markdown 链接的文字和目标地址都计入。
不要用冗长的复合句、分号串联、项目符号列表或多条连续消息来规避这一限制。
worker 在内部报告；orchestrator 负责面向人的 ticket 更新。
orchestrator 提取交付事实并写一条新的通知；它不得转发报告，也不得逐点压缩报告。
回复时使用来源的路由元数据和 worker 报告；缺少技术事实时，等待 worker 的报告，或在 ticket 空闲时用 orchestrator_ticket_request_status 请求一份报告，而不是自己去调查。
使用发起请求的飞书 thread；绝不猜测收件人，也绝不把私密材料复制到 GitHub。
来自 GitHub 的 ticket 保留其来源回复路径，除非有明确的飞书目的地可用。
