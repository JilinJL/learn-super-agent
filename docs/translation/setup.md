---
title: "SETUP"
upstream: "SETUP.md"
---
# SETUP {#setup}

<UpstreamBanner kind="translation" />

这是写给 agent 的说明，供它与运维者一起配置 dsh-superagent。如果你是人，请让你的 coding agent 阅读并照做。

## 如何进行配置 {#how-to-run-the-setup}

配置过程遵循 [docs/000-philosophy.md](./000-philosophy)：尽可能少占用运维者的注意力。

- **在提出第一个问题之前，** 只读这个文件和 `docs/000-philosophy.md`，并运行一次下面的探测命令。在收集齐所有回答之前，不要读其他任何内容。
- **每条消息只问一个问题，** 关于一件事。等到回答后再问下一个。探测结果已经回答的问题就跳过。
- **每条消息不超过 300 字，** 除非运维者要求更多。每个问题都给出一个推荐答案，运维者用一个词就能接受，再用一句话说明它为什么重要。
- **提问期间不要执行。** 先收集所有回答，然后用一条消息发出完整计划，运维者确认后才执行。
- **绝不在聊天中索要密钥。** 需要运维者亲自动手的步骤，例如创建账号、登录某个 CLI 或输入应用密钥，都放进同一条消息，并附上在他们自己终端里要运行的确切命令。
- **通过提问传达设计哲学，** 每次一句，不要长篇说教。

## 1. 探测 {#_1-probe}

在这个 checkout 中运行一次，结果留给自己：

```sh
node -v; pnpm -v; git --version; tmux -V; python3 --version; gh --version | head -1; dsh --version
gh api user --jq .login
command -v lark-cli
grep -l -E 'id: dsh-superagent\b' "${DSH_HOME:-$HOME/.dsh}"/profiles/*/cordis.patch.yml 2>/dev/null
```

- **前置条件：** Node.js 22.19+ 或 24+、pnpm、git 2.32+、tmux、Python 3.8+、GitHub CLI 2.48+，以及版本在 `package.json` 的 `engines.dsh` 范围内的 DSH。缺少的某一项成为计划中的一个条目，而不是一个问题。DSH 还需要一个模型提供方；如果运维者从未用模型运行过 DSH，配置模型就是一个运维者步骤。
- **运维者登录名：** `gh api user` 的结果是运维者自己的 GitHub 登录名，用作问题 5 的推荐答案。
- **已有 profile：** 含有 `dsh-superagent` 条目的 profile 来自之前的一次配置：询问是否继续那次配置，保留它的配置，并阅读 `docs/006-deployment.md` 中的 Upgrade（升级）一节。

## 2. 问题 {#_2-questions}

按以下顺序提问，每条消息一个，顺着 [docs/001-domain.md](./001-domain) 中的工作流程：先问 Trigger（触发）从哪里来，再问谁可以在那里请求工作，最后问 Executor（执行器）拿到 Ticket（工单）后做什么。推荐答案写在方括号里。

**Source（来源）：请求从哪里来。**

1. **Source。** agent 只接受来自 GitHub 的请求，还是也接受来自飞书群聊的请求？[只用 GitHub，除非团队在飞书里工作。]
2. **仓库。** agent 应该在哪个 github.com 仓库上工作，格式为 `owner/name`？
3. **Agent 账号。** agent 将以哪个 GitHub 用户账号行事？[一个专用账号，绝不用运维者自己的：agent 写的所有内容都会以这个名字出现。] 这个账号可能还不存在；创建它是一个运维者步骤。
4. 使用飞书时：**哪些群聊，** 按名称给出？配置好机器人之后，agent 会去查出它们的 id。

**Policy（策略）：谁可以请求工作。**

5. **在 GitHub 上。** 哪些 GitHub 登录名可以请 agent 做事？[只有 `<operator login>`：agent 只为这个名单上的人行事，在运维者了解 agent 的行为方式期间，名单短一些能让团队受到的打扰更少。]
6. 使用飞书时：**在飞书里谁可以请求？** [第一个群聊里的所有人，并与群成员保持同步。]

**执行：agent 拿到 Ticket 后做什么。**

7. **Checkout。** 每个 Ticket 应该从仓库的哪个本地克隆 checkout？[在 `~/src/<name>` 下新建一个克隆。]
8. **提交身份。** agent 的提交应该署名谁为作者？[agent 账号，这样它的工作一眼就能看出是它做的。] 其他身份，例如运维者的身份，写进 Delivery requirements 这个 prompt 小节。
9. **自动合并。** 当 agent 自己的 pull request 准备就绪并获批准后，是否应由它开启自动合并？[否：在 agent 的 pull request 持续正确一段时间之前，由人来合并。] agent 绝不会以 agent 账号开启自动合并，所以选“是”时，它需要另一个有合并权限的账号登录的 GitHub CLI：在运维者步骤中请运维者登录一个，并在 Delivery requirements 中写明。选“否”时，从 Delivery requirements 中删去自动合并那一段。

有合适默认值的取值不要问；把它们列进计划：

- profile `superagent`，它是 DSH Web profile 的一份副本，与运维者日常工作的 profile 分开，这样它重启时不会关掉运维者的 Session；端口 `3082`；状态目录 `<home>/.dsh/state/superagent`，写成绝对路径；
- 从运维者自己的 profile 发起的每小时检查，在 dsh-superagent 没有运行时修复它；
- 分支前缀 `agent/`；
- accept mode（接单模式）`observe`，它只记录主动工作而不去做，以及默认的规则和 prompt 小节；
- 使用飞书时：机器人只读取提及它的消息，私聊处于开启状态。

## 3. 计划 {#_3-plan}

发一条不超过 300 字的消息：要安装什么、账号和 CLI、要保存的设置、运维者步骤，以及默认值。请求一次确认。

## 4. 执行 {#_4-execute}

1. **先做运维者步骤。** 阅读 `docs/006-deployment.md` 的 Accounts（账号）一节，自己写好 CLI 包装脚本，然后用一条消息发出只有运维者能做的事：创建 agent 账号；如果要自动合并，以开启自动合并的那个账号登录一个 CLI；以 agent 账号接受仓库邀请；为每个包装脚本运行 `auth login`；使用飞书时，创建并发布机器人应用，并用它的密钥运行 `config init` 命令。等运维者说完成后，用 `<wrapper> api user --jq .login` 检查每个登录。
2. **安装并启动。** 按照 `docs/006-deployment.md` 的 Install（安装）、Machine configuration（机器配置）和 Start and stop（启动与停止）几节操作。跳过对这个仓库的 `git clone`：你已经在它的 checkout 里了。如果问题 7 要求新建克隆，就克隆问题 2 的仓库。已有 profile 时，跳过 `dsh superagent --from-default-profile` 命令，它会替换 profile 并删除其中的 `cordis.patch.yml`；改为编辑这个文件，而不是替换它。
3. **设置。** 通过 `docs/006-deployment.md` 中的 Management API 保存设置，顺序如下：`github` Source；如果使用飞书，则是 `feishu` Source；带允许名单的 `policy` 块（飞书的话，先用机器人的 CLI 查出群聊 id）；以及 `executor` 块，其中的准备命令根据问题 7 的回答来写。然后保存 prompt，在 Delivery requirements 中写入问题 8 的提交身份和问题 9 的自动合并答案。返回 `restarting: true` 的保存会重启 dsh-superagent：等到 `scripts/dsh-superagent status` 不再以 1 退出后再发下一个请求，并重新从 `GET settings` 读取各个 revision。
4. **失败。** 被拒绝的保存会在响应体中指出配置问题。在 `docs/006-deployment.md` 的 Troubleshooting（故障排查）表中找到它，修复后继续。只有自己无法修复的事情才去问运维者。

## 5. 验证并交接 {#_5-verify-and-hand-over}

`scripts/dsh-superagent status` 以 0 退出，且没有配置问题。如果你运行在运维者自己的 DSH profile 中，就用你的定时任务工具创建 `docs/006-deployment.md` 中 Hourly check（每小时检查）一节所述的每小时检查；否则把它的 prompt 交给运维者，让其在那里设置定时。然后发一条不超过 300 字的消息：

- 面板 URL，并说明侧边栏中的 **Superagent** 入口就是要查看的地方。
- 如何试用：用允许名单上的一个账号，在仓库的某个 issue 下评论 `@<agent login> <request>`。大约一分钟内，概览页上就会出现一个 Ticket。
- 给运维者的三条规则，出自 `docs/000-philosophy.md` 的 Responsibility（责任）一节：从窄处开始，调优以减少打扰，为 agent 说的话负责。
- 去哪里了解更多：`docs/` 中的编号文档，按顺序阅读。
