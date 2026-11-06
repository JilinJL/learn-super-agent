# Mini SuperAgent

这是教程第 11 章的最小示例，用来观察一条请求怎样经过 Gate、Eval、Ticket、Subscription 和持久化副作用队列。

核心流程已有实现，Assessor 和 worker 当前为 stub。worker 只打印输入并返回模拟结果，不会修改代码、创建 worktree 或开 PR。

## 运行测试

需要 Node.js 24 或更高版本，使用 Node 自带的 TypeScript 支持、SQLite 和测试运行器，无需额外安装依赖。

在本目录运行：

```bash
npm test
```

目前有 9 项测试，覆盖重复轮询、Thread 内 Eval 串行、权限检查、事务回滚、回复退避重试、跟进投递，以及待执行操作的部分重启与重放场景。测试使用 FakeSource 和模拟 worker，不访问 GitHub。

## 连接测试仓库

需要安装 GitHub CLI，并用 agent 对应的账号完成 `gh auth login`。`--agent` 只指定账号名，不会切换 GitHub CLI 的登录身份；发送评论使用 `gh` 当前登录的账号。

```bash
gh auth status
npm start -- --repo owner/test-repo --agent your-bot-login --allow alice,bob
```

将 `owner/test-repo`、`your-bot-login` 和 `alice,bob` 换成实际仓库、agent 账号和允许发起任务的账号。在启动之后，由名单内账号发布一条 `@your-bot-login 帮忙处理这个问题` 的 Issue 评论，即可观察接单、模拟执行和回复。

可选参数：

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `--db` | `mini-superagent.db` | SQLite 数据库文件 |
| `--interval` | `10` | 轮询间隔，单位为秒 |

按 `Ctrl+C` 退出。使用同一数据库重新启动，会继续处理已持久化且尚未完成的副作用。

## 当前范围与后续工作

已经实现：

- Trigger 去重、Thread 内串行 Eval、explicit Gate、Ticket 与 Subscription。
- 事务内保存状态和待执行操作，提交后执行，失败时退避重试。
- 通过 `gh api` 轮询 Issue / PR 的普通评论和发送回复，并在发送前检查隐藏标记。

尚未实现：

- 真实模型研判、coding agent CLI、独立 worktree、代码验证和 PR 创建。
- 持久化轮询游标及停机期间新评论的补读。当前每次启动从当前时间开始轮询。
- worker 在外部操作执行到一半时中断的恢复协议；现有重启测试只覆盖测试中指定的中断点。
- 真实 GitHub 账号与仓库的集成验证，以及 CI 中的示例测试。

飞书、`observe` / `auto`、面板、PR 生命周期跟踪和 worker 并发槽位不在这个最小示例当前的实现范围内。
