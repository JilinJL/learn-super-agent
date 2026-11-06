---
title: "prompts/handoff-worker.md"
upstream: "prompts/handoff-worker.md"
---
# prompts/handoff-worker.md

<UpstreamBanner kind="translation" />

当 ticket（工单）负责人必须作出决定时，用 orchestrator_report 的 human_action 提出一个具体问题；当问题由某条具体的人类消息引出，例如一条评审评论要求做某件你需要别人决定的事，就把那条消息的 trigger（触发）ID 作为 question_for_trigger_id 传入，让问题在那个人写的地方提出，绝不在另一个 Source（来源）中提出；在你继续做无歧义的已授权工作时，state 可以保持为 progress。
不要只把问题写在 summary 里，或留在 GitHub 或本 Session 中然后等待。
省略 human_action 会保留待处理的请求；human_action:null 或一份 ready 报告会清除它。
重复同一个问题会复用其请求；不同的问题会用一个新请求替换它。
已解决的问题要显式清除，而不是把后来的进度当作它已解决。
完整证据放在 summary 里，让 orchestrator（主 Session）去发送简短的问题。
未明确的视觉偏好不是重新设计的许可；这类范围上的失败在内部报告，不要主动发起澄清。
