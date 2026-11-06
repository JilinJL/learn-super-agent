---
title: "prompts/team/delivery.md"
upstream: "prompts/team/delivery.md"
---
# prompts/team/delivery.md

<UpstreamBanner kind="translation" />

对于每个改动 UI 的 ticket（工单），PR 描述必须同时包含 Before 和 After 两份视觉证据，并清楚标注，注明基线版本和改动后的版本。
截取相同的场景、视口、主题和相关的 UI 状态，使对比有意义；截图或演示都可以。
只有 After 的证据是不完整的。
使用实际的应用截图，不要把样机图当作先前的实现展示，也不要暴露飞书私密内容或凭据。
后续的 UI 改动使对比过时后，要更新对比。
如果拿不到真实的基线截图，就如实说明缺少的证据和限制，让交接保持未完成状态，不要声称这个 UI PR 已就绪。
worker（执行器 Session）负责截取并核实对比；orchestrator（主 Session）在交付 ready 结果之前检查报告的证据。

请求匹配的规则、assignment（派工）、这些 prompt 或仓库指令所要求的评审。
绝不以 agent（智能体）账号开启 auto-merge，以免 agent 合并自己的工作：只用本节指定的 merge CLI 开启它，命令为 `<merge CLI> pr merge <number> --auto --merge --match-head-commit <sha> --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY`。
本节没有指定 merge CLI 时，每个 PR 都由人来合并。
有 merge CLI 时，对于你从 ticket 分支开的 PR，在以下条件全部满足后为其 head commit 开启 auto-merge：PR 已就绪；改动少于 200 行（新增加删除）；那些指令要求的每一项批准都覆盖该 commit；如果它改变了用户看到的内容，那些指令指定了谁来批准这类改动，且该批准覆盖该 commit。
报告 ready 时不要等待批准，批准到达时再开启 auto-merge。
否则由人来合并该 PR；在你的报告中说明这一点。
一旦其中任何一个条件不再成立，例如某个评审要求修改，以及在你向该 PR 推送之前，就用 `<merge CLI> pr merge <number> --disable-auto --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY` 撤回 auto-merge；对新的 head 这些条件再次成立后再重新开启。
绝不代替评审者批准或合并。
为评审你所开 PR 的每个人署名，每个 PR 一次，覆盖 PR 分支上的每个 commit：当某位人类评审者对它的反馈第一次被研判时，改写分支，使其中每个 commit 对每个迄今已署名的人都带一条 `Co-authored-by: <name or login> <id+login@users.noreply.github.com>` trailer，其中 id 来自 `gh api users/<login> --jq .id`。
先按上面的方式撤回 auto-merge。
运行 `git fetch origin`，用 `gh pr view <number> --json baseRefName` 得到的 base 分支设置 `base=$(git merge-base HEAD origin/<base branch>)`，并设置 `old=$(git rev-parse origin/<head branch>)`，然后运行 `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD`，每个署名的人一个 `--trailer`，这只改变 commit 消息，再用 `git push --force-with-lease=<head branch>:$old` 推送；如果推送被拒绝，就停止并报告。
你之后添加的 commit 带上相同的 trailer。
对某个 commit 的批准也覆盖它改写后的副本，因为二者的 tree 相同。
如果 PR 已合并，就不要改写它；在 orchestrator_report 中记录未署名的评审者。
绝不为了给评审者署名而推送空 commit。
不要为以下对象署名：bot（login 以 [bot] 结尾的账号，以及这些指令指定为评审 bot 的账号）、PR 的作者、agent 账号，或这些指令指定为 commit 作者的人，后者已经作为每个 commit 的作者获得署名。
在 orchestrator_report 中记录你已为谁署名，以免之后的 worker 再次为他们署名。
如果有人正在处理同一个问题，而他们的分支或 PR 包含了本 ticket 的代码（来自 ticket 分支的 commit，或沿用了它的改动），就立即用 gh 关闭本 ticket 的 PR，不询问任何人，并在上面留一句话，写明那个人的 PR。
只是相关、或者不包含本 ticket 代码的工作，不是关闭的理由。
关闭该 PR 会结束 ticket；不要发送其他消息。
