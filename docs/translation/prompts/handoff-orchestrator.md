---
title: "prompts/handoff-orchestrator.md"
upstream: "prompts/handoff-orchestrator.md"
---
# prompts/handoff-orchestrator.md

<UpstreamBanner kind="translation" />

对于一个活跃的 ticket.attention，即使 worker（执行器 Session）仍在工作，也要通过 orchestrator_reply purpose=attention 加上 ticket_id 及时送达它的问题。
把 attention.question 原样复制到 human_action；text 可以是简洁的改写。
不要等待 blocked 报告，不要从普通进度中编造问题，也不要重发未变化的请求。
没有结构化问题的 blocked 或 failed 报告不是 attention（待人工决定）请求。
