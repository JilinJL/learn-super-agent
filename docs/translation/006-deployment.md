---
title: "006 部署"
upstream: "docs/006-deployment.md"
---
# 006 部署 {#_006-deployment}

<UpstreamBanner kind="translation" />

本指南介绍如何安装、配置和运维 dsh-superagent，涵盖账号、启动检查、升级和故障排查，内容建立在 [001 领域模型](./001-domain) 到 [005 面板](./005-panel) 的基础上。

## 运行哪些东西 {#what-runs}

- **一个专用的 DeepSeek Harness profile**，本指南中称为 `superagent`。用 Web profile 模板创建它。它加载这个 bundle，并在 `127.0.0.1` 上提供面板。不要和你日常工作用的 profile 混用：插件会修改进程级的 `PATH` 和 git 设置，它的进程也需要独立地重启和升级。
- **一个智能体专用的 GitHub 账号。** 智能体以这个账号的身份发表评论、推送分支、发起 pull request，使用的是一个只登录了该账号的 GitHub CLI。
- **可选：** 一个用于接收聊天请求的飞书机器人。

插件配置里只放状态目录和机器级限制。其余一切都在面板里设置：Sources（来源）里设置仓库和账号，Policy（策略）里设置允许名单，Execution 里设置 worker 目录和命令。

### 权限与隔离 {#permissions-and-isolation}

这个 bundle 为 Executor（执行器）定义了 `dsh-superagent-worker`，为主 Session 定义了 `dsh-superagent-router`。它们会出现在 DeepSeek Harness 的预设列表里，但只供 dsh-superagent 使用。不要在个人 Session 里选用它们，也不要禁用它们的配置行。应用需要靠它们创建和恢复自己的 Session。

在 Web UI 里打开一个空白的托管 Session 时，可能会选中 profile 的默认预设。dsh-superagent 会在第一轮之前恢复该角色对应的预设。

两个预设都以运维者的操作系统用户身份、用 `danger-full-access` 运行，并读取已订阅 Thread（线程）中的消息。账号 wrapper 默认选择智能体的凭据，但并不隔离进程。worker 可以按路径执行程序，也能读取运维者的 home 目录。如需隔离，请使用一个只存放智能体凭据的专用操作系统账号。

## 前置条件 {#prerequisites}

- Node.js 22.19+ 或 24+、pnpm、git 2.32+、Python 3.8+ 和 tmux
- GitHub CLI（`gh`）2.48 或更高版本。Source 的 CLI 字段必须指向 `gh` 或 `lark-cli` 的 wrapper；宿主依赖它们的子命令和输出格式。
- github.com 上的一个仓库；不支持 GitHub Enterprise Server。要为每个 Ticket（工单）创建一份 checkout，需要保留一个本地 clone，供准备命令从中添加 worktree。如果该仓库使用 Git LFS，请安装 `git-lfs`。
- 为 DeepSeek Harness 配置好的模型提供方。dsh-superagent 使用 profile 的默认模型，除非 Eval（评估）或 Execution 设置里指定了其他模型。
- 飞书：`lark-cli`（已用 1.0.90 测试）以及一个带机器人能力的飞书或 Lark 应用

## 账号 {#accounts}

### 智能体 GitHub 账号 {#agent-github-account}

1. 为智能体创建一个 GitHub 用户账号，并授予它对仓库的写权限。GitHub App 不能充当智能体，因为 dsh-superagent 要读取这个账号的通知。
2. 给它配一个只使用它自己凭据的 GitHub CLI：

   ```sh
   mkdir -p ~/.local/bin
   cat > ~/.local/bin/gh-agent <<'EOF'
   #!/bin/sh
   GH_CONFIG_DIR="$HOME/.config/gh-agent" exec gh "$@"
   EOF
   chmod +x ~/.local/bin/gh-agent
   gh-agent auth login
   gh-agent api user --jq .login
   ```

   用智能体账号登录；最后一条命令会打印它的 login。dsh-superagent 也是用同样的方式读取 login。

### 飞书机器人（可选） {#feishu-bot-optional}

1. 创建一个具备机器人能力的自建应用。授予它接收消息事件、读取和发送群聊消息、读取群成员的权限，然后发布应用版本。
2. 给机器人一份独立的、限定为机器人身份的 `lark-cli` 配置，以及一个 wrapper：

   ```sh
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config init --app-id <cli_…> --app-secret-stdin
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config strict-mode bot --global
   cat > ~/.local/bin/lark-bot <<'EOF'
   #!/bin/sh
   export LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent"
   exec lark-cli "$@"
   EOF
   chmod +x ~/.local/bin/lark-bot
   ```

   第一条命令从标准输入读取应用密钥。请使用单独的配置目录：`lark-cli` 每个 app id 只允许一个 profile，而你的个人配置里可能已经有该应用的用户登录。

   宿主会拒绝能以用户身份操作的 CLI。它从机器人配置中读取 app id、飞书/Lark 品牌和机器人的 `open_id`。

   两份配置共用钥匙串里同一个应用密钥条目。如果只想删除机器人配置，删掉它的目录即可；不要运行 `lark-cli config remove`，那会影响共用的密钥。

## 安装 {#install}

在一台还没有 `superagent` profile 的机器上，把下面这段命令运行一次：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

上面固定的版本是公开发布的；其他版本必须满足 `package.json` 中的 `engines.dsh`。

第四条命令用 DeepSeek Harness 的 Web 模板创建 `~/.dsh/profiles/superagent`。第五条安装这个 bundle。设置 `DSH_HOME` 可以把默认的 `~/.dsh` 目录换到别处。

创建 profile 的命令只用于全新安装。如果 profile 已经存在，这条命令会替换它，并删除其中的 `cordis.patch.yml`，包括机器配置。不要在升级时使用它。

## 机器配置 {#machine-configuration}

把 [examples/profile.cordis.patch.yml](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/examples/profile.cordis.patch.yml) 复制为 `~/.dsh/profiles/superagent/cordis.patch.yml`，替换掉原文件，并替换其中每一个 `<placeholder>`。如需飞书，还要启用其中的 `dsh-superagent-feishu` 条目。`webserver` 条目设置面板的端口。

| 键 | 必填 | 含义 |
| --- | --- | --- |
| `stateDir` | 是 | 绝对路径，存放数据库、锁、`worker-bin` 中的命令 shim、智能体的 git 配置，以及默认放在 `work` 中的 Ticket 目录。升级前请备份 |
| `promptMaxChars`、`admissionContextMaxPages`、`admissionContextTimeoutMs` | 否 | 可保存的 prompt 配置的最大长度，以及一次研判在多长时间内读取多少页 Thread |

首次启动之后，可以在 **Settings → Deployment** 或 DeepSeek Harness 的 Plugin Manager 里修改机器限制。修改无需重启即可生效。`stateDir` 不能在那里修改。无效的值或未知的配置键会导致无法启动；日志会指出是哪个键。

## 启动与停止 {#start-and-stop}

```sh
scripts/dsh-superagent start
scripts/dsh-superagent status
```

`start` 在 tmux 会话 `dsh-superagent` 中运行 `dsh --profile superagent`；如果是其他 profile，会话名为 `dsh-<profile>`。它最多等待一分钟，直到运行时就绪或报告初始化要求。首次运行时，它会打印缺少的初始化信息。它拒绝重复启动实例，包括在这个脚本之外启动的实例。

`stop` 和 `restart` 请求优雅关闭，并最多等待五分钟让 Executor 结束。它们从不强制杀死进程，也不碰其他 tmux 会话。

`status` 打印进程 id、健康状态和初始化问题。如果是其他 profile 或端口，使用 `--profile` 和 `--url`，或者设置 `DSH_SUPERAGENT_PROFILE` 和 `DSH_SUPERAGENT_URL`。

`status`、`start` 和 `restart` 以下面四个退出码之一退出：

| 退出码 | 含义 |
| --- | --- |
| 0 | 服务正常运行 |
| 1 | 服务没有运行、运行了两份、没有响应，或者其运行时报告了错误；重启可能解决问题 |
| 2 | 服务在运行，但运行时以外的某个部分（例如某个 Source 或某次 Policy 同步，`sync:<source id>`）报告了错误；重启无法解决 |
| 3 | 服务在运行，正在等待初始化；重启无法解决 |

仍在启动中的 Source 算作正常运行。初始化无法检查的飞书机器人也算正常运行。

`status` 在 `errors` 下返回出错的部分及其详情，在 `setup` 下返回初始化要求。`start` 和 `restart` 把这些问题逐行打印出来；如果服务始终没有起来，它们以 1 退出。只有主动执行 `stop` 才会暂停自动恢复。

每个 profile 都把日志和控制文件放在 `.artifacts/` 下：

- 启动日志：`dsh-superagent-<profile>-<date>-<time>-<pid>.log`，其中的 pid 是脚本的进程 id。保留最新的 20 个。
- 控制文件：`control/profiles/<profile>/`，包含停止标记、锁和进程 id。

打开日志里打印的 URL，然后在侧边栏中选择 **Superagent**。

### 每小时检查 {#hourly-check}

在你平时使用的 DeepSeek Harness profile 里创建每小时检查，而不是在 `superagent` 里。智能体服务宕掉时，这个检查也必须继续运行。请那个 profile 里的一个 agent 用下面这段 prompt 创建一个每小时执行的计划任务，并填入 checkout 路径：

```text
Check dsh-superagent: run `scripts/dsh-superagent --profile superagent status` in <checkout>. Exit 0: do nothing and say nothing. Exit 2: do not restart; tell me each part under `errors` with its detail, unless you already told me about the same ones. Exit 3: do not restart; tell me what `setup` says setup needs, unless you already told me. If it reports manually_stopped: true, leave it stopped. Otherwise (exit 1) run `scripts/dsh-superagent --profile superagent --respect-stop restart`, which exits the same way: 0 means it recovered, so say nothing; 2 and 3 are reported as above; if it exits 1 or fails otherwise, read the newest .artifacts/dsh-superagent-superagent-*.log and the Troubleshooting section of docs/006-deployment.md, fix what you can, and tell me what was wrong and what you did.
```

`--respect-stop` 会保留主动的停止。只有 `stop` 会写入停止标记；`start` 会清除它。`restart` 不写标记，因此当某次重启的关闭阶段超时时，检查仍能把它恢复。

## 设置 {#settings}

初始化必须成功，轮询和工作才会开始。Overview 会列出缺少的要求，并链接到对应的设置。修改设置会重新运行初始化。如果你在应用之外修复了问题，例如 CLI 认证，请选择 **Check again**。

1. **Sources。** 设置 GitHub 仓库（`owner/name`）和智能体 CLI，例如 `/home/me/.local/bin/gh-agent`。请求通常通过智能体账号的通知到达。新的 Issue 或提及该账号的评论会在下一次轮询时到达；通过编辑已有 Issue 正文加上的提及则不会。请改为发一条新评论。如需飞书，设置机器人 CLI、群聊、每个群聊是接收全部消息还是只接收提及，以及是否接收私聊消息。
2. **Policy。** 两条示例规则可以编辑或删除。在 **On each Source** 下，添加可以请求工作的 GitHub 账号和飞书用户；在名单里有人之前，任何请求都不能成为 Ticket。使用飞书时，可以选择一个群聊，在启动时和点击 **Sync now** 时从中同步名单。
3. **Execution。** 目录根和准备命令。要给每个 Ticket 一份仓库的 checkout：

   ```sh
   git -C /home/me/src/widgets fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
   git -C /home/me/src/widgets worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
   ```

   把个人 CLI（例如登录了你自己账号的 CLI）列为被阻止的命令。
4. **Prompts。** 设置团队段落：GitHub 披露行、评审机器人、提交作者和自动合并条件。

### 管理 API {#management-api}

面板使用一个本地 HTTP API，智能体也可以调用它。`SETUP.md` 用它保存设置，服务脚本读取 `GET state`。

把请求发到 `http://127.0.0.1:<port>/orchestrator/api/`，并带上 `x-orchestrator-request: 1`。host 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`。缺少请求头或来自其他站点的 `Origin` 会收到 403。

通过 API 保存与面板拥有相同的权限。与通过主 Session 的工具保存不同，它们可以修改执行环境和初始化相关的账号字段。

智能体可以依赖下面这些路由和字段。`src/app/api.ts` 里的其他路由服务于面板，会随面板变化。

| 请求 | 响应 |
| --- | --- |
| `GET state` | 每个页面都会读取的内容：`setup`，包含 `problem` 和 `feishuProblem`，二者各为 `null` 或一个带 `place`、`code`、`values` 和 `detail` 的初始化问题，在初始化解析出账号后还包含 `accounts`；`health`，每个部分一个条目（见下文），带 `state`（`starting`、`ready`、`paused` 或 `error`）、`detail` 和 `at`；`load`，即 `running` 的 Executor Session、`queued` 的 Ticket 和 `maxWorkers`；`paused`；以及 `masterId` |
| `GET settings` | `blocks`：`policy`、`eval` 和 `executor`，各带 `value` 和 `revision`；`sources`：各个 Source 实例，每个带 `id`、`kind`、`installed`、其 block 的 `value`（`{"enabled": …, "config": {…}}`）和 `revision`、其 kind 的表单，以及存在时的初始化 `problem`；`policyVersion`；以及 `environment`，即执行环境的 `root` 和 `variables` |
| `GET sources` | 每个 Source 的状态：`state`（`missing`、`off`、`error`、`setup`、`starting`、`paused` 或 `ready`）、其各部分的 `health`、其初始化 `problem`、最近一天的 `stats`、它在这一天里 `filtered` 的 Trigger（触发），以及它在这一天里 `dropped` 的消息，最新丢弃的在前，每条带 `channel`、`preview`、属于某个 Ticket 时的 `ticket`（`id` 和 `title`）、存储中有记录时的 `thread`，以及 `dropped.at` 和 `dropped.reason`（`channelGone` 或 `channelIgnored`） |
| `PUT settings/<block>`，带 `{"value": …, "revision": n}` | 保存一个 block：`saved`、该 block 新的 `revision`、`policy_changed` 和 `restarting`。`value` 是整个 block，形式与 `GET settings` 中的一致；缺少的键取默认值 |
| `POST executor/pause`，带 `{"paused": true}` 或 `false` | 暂停或恢复处理：`paused` |
| `POST setup/check` | 通过重启 dsh-superagent 重新运行初始化：`restarting: true`。当初始化没有需要修复的问题时会被拒绝 |
| `POST policy-sync/<source id>` | 立即同步该 Source 的允许名单：`policy`，即该 Source 保存后的那部分 |
| `GET prompts`，带 `{"config", "baseRevision"}` 的 `PUT prompts` | 读取 prompt 配置：`current`，带其 `revision` 和 `config`；`defaults`；`sections`，即按 Session 读取顺序排列的团队段落；`skillName`，即团队 skill 名称的格式；`builtin`，即团队 skill 不能使用的名称；以及 `skillPrefix`，即 Session 加载 skill 名称时所加的前缀。或者保存它：返回新的 `revision` |
| `POST tickets/<id>/retry`、`POST tickets/<id>/stop` | 重试或停止一个 Ticket，与面板的操作相同 |

健康条目按职责分组：

| 条目 | 报告内容 |
| --- | --- |
| `runtime` | 应用本身 |
| `models` | 正在等待模型预算重试的 Session |
| `evals` | 最近一小时内不可用、且之后没有判断或驳回的 Eval |
| `assessment`、`launch`、`delivery`、`relay`、`notice`、`reply` | [003 执行](./003-execution) 中描述的持久化的待办工作；delivery 统计等待中的工作，reply 则涵盖 Channel（渠道）消息 |
| `worker` | Executor Session 的事件处理；在第一次失败后出现 |
| `github`、`feishu`、`history` | Source 的轮询、事件和历史恢复 |
| `sync:<source id>` | 允许名单同步 |

拒绝会带一个状态码和 `error`，即其英文文本：

- 400：无效的值（`issues`，每条带其 `path`）、账号检查失败（`setup`）、固定的拒绝（`code` 和 `values`），或者请求体不是 JSON 或过大。
- 404：不存在的对象。
- 409：过期的 revision。
- 500：其他所有情况。

各个 block：

- `source:github`、`source:feishu`：`{"enabled": true, "config": {…}}`。GitHub 的 config 包含 `repository` 和 `cli`，以及开关 `observeIssues`、`observePulls`、`observeComments` 和 `observeCi`，默认关闭，打开后分别接收仓库中每一个新 Issue、新 pull request、评论以及默认分支的 CI；飞书的 config 包含 `cli`、形如 `[{"chatId": "oc_…", "name": "…", "listen": "mentions"}]`（或 `"all"`）的 `chats`、`directMessages`，以及取值为 `"none"` 或 `"mentions"` 的 `otherChats`。
- `policy`：`{"rules": […], "sources": {"github": {"allowed": [{"id": "<login>"}], "bots": [{"id": "dependabot[bot]"}]}, "feishu": {"allowed": [{"id": "ou_…", "name": "…"}], "syncChat": "oc_…", "admission": {"oc_…": {"unlistedAddressed": "explicit"}}}}}`。`bots` 列出其消息可以成为推断候选的机器人。`admission` 的行，对飞书以群聊 id、`other` 或 `direct` 为键，对 GitHub 以 `issues`、`pulls`、`comments` 或 `ci` 为键；未设置的格子取默认值（见 [002 授权](./002-authorization)）。
- `eval`：`mode`、`timeoutSeconds` 和 `model`。
- `executor`：`model`、`maxWorkers`、`directory`、`prepare` 和 `blockedCommands`。暂停处理是一个单独的设置 `paused`，由 `POST executor/pause` 设置。

修改仓库或 CLI 会先运行相应的初始化检查。检查失败时返回 400，详情放在 `setup` 中。账号修改成功，或者在初始化待完成期间的任何保存，都会返回 `restarting: true`。应用重启期间，API 暂时不可用。

```sh
api=http://127.0.0.1:3082/orchestrator/api
rev=$(curl -s -H 'x-orchestrator-request: 1' $api/settings | jq '.sources[] | select(.id == "github") | .revision')
curl -s -X PUT -H 'x-orchestrator-request: 1' -H 'content-type: application/json' $api/settings/source:github \
  -d "{\"value\": {\"enabled\": true, \"config\": {\"repository\": \"acme/widgets\", \"cli\": \"$HOME/.local/bin/gh-agent\"}}, \"revision\": $rev}"
```

## 初始化检查 {#setup-checks}

初始化和 worker shell 一样，使用 DeepSeek Harness 的子进程服务。它会移除名称中含有 KEY、PASSWORD、SECRET 或 TOKEN 的环境变量。

初始化会验证 GitHub 仓库和智能体的推送权限，写入 worker 环境，并检查 git 对 github.com 只使用智能体的凭据。飞书初始化失败只会禁用飞书 Source。

初始化写入的进程环境：

- **命令 shim**，位于 `<stateDir>/worker-bin`，排在 `PATH` 的最前面：`gh` 运行智能体的 CLI；`lark-cli` 运行机器人的 CLI；被阻止的命令直接失败。shim 在运行目标之前，会把自己所在的目录从 `PATH` 中移除。
- **git 配置**，位于 `<stateDir>/worker-gitconfig`：取代运维者的全局和系统 git 配置。它把智能体 CLI 设为 github.com 的凭据助手，把 GitHub 的 SSH 地址改写为 HTTPS，并定义 Git LFS 过滤器。个人 git 设置（例如 HTTP 代理）不会生效。这里不设置提交身份，git 永远不会提示输入凭据，`GH_TOKEN` 和 `GITHUB_TOKEN` 也会被移除。

`worker-bin` 或 `worker-gitconfig` 中只要有一个文件不是 dsh-superagent 写入的，初始化就会停止。如果 Ticket 目录位于某个 git 仓库内，而该仓库自身的配置添加了凭据，这个 Ticket 会失败。

## 试一试 {#try-it}

用一个在允许名单里的 GitHub 账号，打开一个 Issue 或发一条评论，内容包含 `@<agent login> <request>`。在一个轮询间隔内（默认一分钟），Overview 应该会显示一个 Ticket。智能体会确认收到请求，在自己的 Session 和目录里工作，并在原来的对话里交付。如需测试飞书，在已配置的群聊里提及机器人。

## 升级 {#upgrade}

1. 等到没有 Executor 正处在某一轮的中途。
2. 备份 `<stateDir>/orchestrator.sqlite`。
3. 运行 `git pull && pnpm install && pnpm build`。
4. 运行 `scripts/dsh-superagent restart` 并检查其状态。

重启会结束正在运行的 Assignment（派工），并带着恢复说明启动替代的 Assignment。团队文本和被覆盖的 prompt 部分会保留；没有覆盖的部分采用新的默认值。升级后请检查标记为 **Default updated** 的部分。

被较新版本迁移过的数据库不能被较旧的版本打开。因此回滚需要升级前的备份。升级 DeepSeek Harness 本身之后，请重启正在运行的实例，让面板加载匹配的产物。

### 智能体预设 {#agent-presets}

worker 和 router 预设会在 5 秒后把 shell 命令转到后台。Session 缺少预设就无法加载。只要相应的 Session 还在使用，就要在 `cordis.patch.yml` 中保留 `dsh-superagent-worker` 和 `dsh-superagent-router` 这两行；否则恢复时会以 `agent-preset/not-found` 失败。

## 故障排查 {#troubleshooting}

初始化问题会以面板的语言显示在 Overview 上，并附带修复链接；日志和 API 显示的是下面的英文文本。

| 现象 | 原因与修复 |
| --- | --- |
| `The agent GitHub CLI is not set.` | 在 GitHub 卡片上设置智能体的 CLI |
| `The agent GitHub CLI was not found.` | 设置 wrapper 的绝对路径，或 `PATH` 上的命令名 |
| `The agent GitHub CLI cannot read its account` | 用 `auth login` 让 wrapper 登录 |
| `@… cannot read …` 或 `@… cannot push to …` | 授予智能体账号对仓库的写权限 |
| `The GitHub Source names no repository.` | 在 GitHub 卡片上设置仓库（`owner/name`） |
| Ticket 以 `The prepare command failed: …` 失败 | 输出会指出原因，例如 clone 路径错误；修好命令，然后重试该 Ticket |
| `git does not read the github.com credential configuration dsh-superagent writes` | 安装 git 2.32 或更高版本 |
| Ticket 以 `The git configuration of the repository in … sets …` 失败 | 从 clone 的 `.git/config` 中移除所指出的凭据或 `http.*.extraheader` 设置 |
| `… was not written by dsh-superagent` | 把所指出的文件移出 `<stateDir>/worker-bin` 或 `<stateDir>/worker-gitconfig`，或者换一个 `stateDir` |
| `The bot lark-cli allows user identities` | 让飞书 Source 指向一份仅限机器人的配置，见上文“飞书机器人” |
| `The bot lark-cli does not work.` 或 `The bot identity of app … is …` | 检查配置中的 app id 和密钥 |
| `The Feishu bot is not a member of the chat.` | 在群聊设置中把机器人加入群聊；下一次尝试就会成功 |
| `status` 以 2 退出 | 某个部分报告了重启无法解决的错误：`errors` 列出每个部分（见“管理 API”中的列表）及其详情；每个部分恢复正常后会自行清除自己的条目 |
| `status` 以 3 退出 | 初始化在等待：`setup` 说明缺少什么，Overview 链接到能修复它的设置 |
| `status` 以 1 退出 | 服务没有运行、运行了两份、没有响应，或者其运行时报告了错误；输出和最新的日志会说明是哪一种 |
| `… timed out after 90 s`、`… was stopped by …`、`… exited with code …` 或 `… could not run: …` | 某个 CLI 失败了，但没有打印原因；以运维者的用户身份手动运行所指出的程序，查看它自己的报错 |
| 面板显示 dsh-superagent 没有响应 | 它正在重启，或者因为配置问题没有启动；DeepSeek Harness 的日志会指出原因 |
| `dsh-superagent configuration has keys it does not use`（日志） | 移除所指出的键；消息会说明每个值现在放在哪里 |
| 日志显示插件与正在运行的 dsh 不兼容 | 安装 `engines.dsh` 范围内的 DeepSeek Harness 版本 |
| DeepSeek Harness 升级后面板显示 "Failed to load plugins" | 重启正在运行的实例 |
| 提及之后没有任何反应 | 检查作者是否在该 Source 的允许名单里、Source 是否开启、处理是否被暂停。在 GitHub 上，通过编辑 Issue 正文加上的提及不会被接收；请在评论中提及智能体 |
