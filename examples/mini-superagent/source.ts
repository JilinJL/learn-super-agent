// Source：把外部事件翻译成 Trigger，并负责往 Channel 写回。两个实现：测试用的 FakeSource 和轮询 GitHub 的 GhSource。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { key } from './model.ts'
import type { OutboundMessage, Trigger } from './model.ts'

export interface Source {
  /** 读一轮新事件。可以重复返回读过的事件，Engine 靠 Trigger id 去重。 */
  poll(): Promise<Trigger[]>
  /** 发一条消息。可能失败，失败由 effect 队列重试，所以必须可以安全地重发。 */
  send(message: OutboundMessage): Promise<void>
}

/** GitHub REST API 返回的 Issue 评论里，这里用到的字段。 */
export interface GithubComment {
  id: number
  html_url: string
  issue_url: string
  body: string
  user: { login: string; type: string }
  created_at: string
  updated_at: string
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const mentions = (body: string, agent: string) => new RegExp(`(^|[^\\w-])@${agent}(?![\\w-])`, 'i').test(body)

/** 一条评论 → 一个 Trigger。id 只由评论本身决定：URL + 评论 id + 最后编辑时间。 */
export function commentTrigger(comment: GithubComment, agent: string): Trigger {
  const number = Number(comment.issue_url.split('/').at(-1))
  return {
    id: key('github-comment', comment.html_url, String(comment.id), comment.updated_at),
    thread: `github:${number}`,
    actor: comment.user.login,
    // 只记录事实：是不是人、有没有 @。能不能接单由 Gate 判断
    human: comment.user.type === 'User' && !sameLogin(comment.user.login, agent),
    addressed: mentions(comment.body, agent),
    at: comment.updated_at,
    text: comment.body,
    channel: { number },
  }
}

/** 测试用：评论放在内存里，发出的消息记在 sent 里；failSends 让接下来几次发送失败。 */
export class FakeSource implements Source {
  readonly comments: GithubComment[] = []
  readonly sent: OutboundMessage[] = []
  failSends = 0
  private next = 1
  private readonly agent: string
  constructor(agent: string) { this.agent = agent }
  comment(number: number, login: string, body: string, options: { type?: string; at?: string } = {}): GithubComment {
    const at = options.at ?? new Date(Date.UTC(2026, 10, 1, 0, 0, this.next)).toISOString()
    const id = this.next++
    const comment = { id, body, html_url: `https://github.com/acme/shop/issues/${number}#issuecomment-${id}`,
      issue_url: `https://api.github.com/repos/acme/shop/issues/${number}`,
      user: { login, type: options.type ?? 'User' }, created_at: at, updated_at: at }
    this.comments.push(comment)
    return comment
  }
  async poll(): Promise<Trigger[]> { return this.comments.map(comment => commentTrigger(comment, this.agent)) }
  async send(message: OutboundMessage): Promise<void> {
    if (this.failSends > 0) { this.failSends--; throw new Error('GitHub is unavailable') }
    this.sent.push(message)
  }
}

const run = promisify(execFile)

/** 用 gh CLI 轮询一个仓库的 Issue 与 PR 评论，并以 gh 登录的账号发评论。 */
export class GhSource implements Source {
  private readonly repo: string
  private readonly agent: string
  private since: string
  constructor(repo: string, agent: string, since = new Date().toISOString()) {
    this.repo = repo
    this.agent = agent
    this.since = since
  }
  private async api(...args: string[]): Promise<unknown> {
    const { stdout } = await run('gh', ['api', ...args], { maxBuffer: 32 * 1024 * 1024 })
    return JSON.parse(stdout || 'null')
  }
  async poll(): Promise<Trigger[]> {
    // since 可能把上一轮最后一条评论再返回一次：它的 id 不变，Engine 会当作 duplicate
    const path = `repos/${this.repo}/issues/comments?sort=updated&direction=asc&per_page=100&since=${encodeURIComponent(this.since)}`
    const pages = await this.api('--paginate', '--slurp', path) as GithubComment[][]
    const comments = pages.flat()
    if (comments.length) this.since = comments.at(-1)!.updated_at
    // agent 自己发的评论不读回来，和上游一样
    return comments.filter(comment => !sameLogin(comment.user.login, this.agent)).map(comment => commentTrigger(comment, this.agent))
  }
  async send(message: OutboundMessage): Promise<void> {
    // 评论里带一个隐藏标记：上次发送其实成功了、只是没收到响应时，重试前先查到它，不重复发
    const marker = `<!-- mini-superagent:${message.id} -->`
    const path = `repos/${this.repo}/issues/${message.channel.number}/comments`
    const pages = await this.api('--paginate', '--slurp', `${path}?per_page=100`) as GithubComment[][]
    if (pages.flat().some(comment => sameLogin(comment.user.login, this.agent) && comment.body.includes(marker))) return
    await this.api('--method', 'POST', path, '-f', `body=${message.text}\n\n${marker}`)
  }
}
