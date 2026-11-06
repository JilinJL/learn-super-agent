---
title: "skills/dsh-superagent-github/SKILL.md"
upstream: "skills/dsh-superagent-github/SKILL.md"
---
# skills/dsh-superagent-github/SKILL.md

<UpstreamBanner kind="translation" />

```yaml
name: dsh-superagent-github
description: Read GitHub issues, pull requests, reviews and CI using gh.
```


worker（执行器 Session）在需要时用 orchestrator_read 获取仓库上下文：github/issues/&lt;number> 或 github/pulls/&lt;number> 读取描述；github/issues/&lt;number>/comments/1 读取对话评论；github/pulls/&lt;number>/comments/1 读取评审评论；github/pulls/&lt;number>/thread/&lt;comment-id> 读取其中任一评论所在的评审 thread（线程）；github/pulls/&lt;number>/reviews/1 读取评审；github/pulls/&lt;number>/checks 读取 CI。一页包含 20 个条目，在可能还有下一页时给出 next_resource。一条评论或评审是 `{ id, from, at, text, reply_to?, path?, line?, url }`：`id` 是 GitHub 的评论 id，`reply_to` 是其评审 thread 的第一条评论，`path` 和 `line` 是评审评论所在的文件和行，`bot: true` 表示 bot 或 GitHub App，其言论绝不授权工作。跟随 next_offset 读完当前响应；offset 0 重新读取，之后的 offset 读取同一个快照。读取不会创建 ticket（工单）或发送回复。允许的提及会订阅该 issue/PR。已订阅的评论和评审无需再次提及就会到达；由本部署 GitHub 账号创建的 PR 会被自动订阅，已订阅 PR 上发生变化的 CI 会被投递。其他活动按需获取；需要这些快捷方式之外的上下文时，阅读本 skill 中包含的 CLI 说明，通过 gh 访问。

在为一个新的人类请求或评审评论开展实质性工作之前，用它的原始 trigger（触发）ID 和一段简短、针对该请求的 `text` 调用 `orchestrator_ack`，即使是在已有的 ticket 内；宿主会在那个来源 thread 中回复一次。这一确认与评审 thread 的回复方式是两回事。不要确认 bot 或 CI。

按 Communication 一节所说回复并解决评审 thread。要解决一个 thread，使用 GitHub GraphQL 的 `resolveReviewThread`。

对于以 `#discussion_r<ID>` 结尾的评审评论 URL，读取 github/pulls/&lt;PR>/thread/&lt;ID>；其第一条评论的 id 就是根 ID。当结果需要回复时，用 `gh api repos/<OWNER>/<REPO>/pulls/<PR>/comments/<ROOT>/replies --method POST -f body=<text>` 发布，其中 `<OWNER>/<REPO>` 是执行环境一节中的 `$DSH_SUPERAGENT_GITHUB_REPOSITORY`。不要用 `gh pr comment` 或 issue 评论端点来发评审 thread 的解释。在 `orchestrator_report` 中记录 bot 运行标识、评审轮次计数和处理结果；PR 描述保留最终的实现、验证和重大限制。

宿主把已订阅 PR 的评论、评审和 CI 直接投递给绑定的 worker。创建或接管一个 ticket PR 后，立即用 `state: progress` 和 `pr_number` 调用 `orchestrator_report`；不要等待 CI 或交接。阅读每个原始 trigger，并在实质性工作之前确认新的人类请求。worker 报告仍然交给 orchestrator（主 Session），由它向来源对话做简洁的交付。
