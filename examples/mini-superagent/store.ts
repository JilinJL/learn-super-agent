// SQLite 持久化：七张表，加一个同步的 atomic()。
import { DatabaseSync } from 'node:sqlite'
import type { OutboundMessage } from './model.ts'

type Table = 'trigger' | 'thread' | 'decision' | 'ticket'

export class Store {
  readonly db: DatabaseSync
  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trigger (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS thread (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decision (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ticket (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscription (thread TEXT NOT NULL, ticket TEXT NOT NULL, PRIMARY KEY (thread, ticket));
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, value TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS effect (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, seq INTEGER NOT NULL,
        generation INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, due INTEGER NOT NULL,
        error TEXT NOT NULL DEFAULT '', PRIMARY KEY (kind, key));
    `)
  }

  /** 一个命令一个事务。work 必须是同步的：事务里不能 await，也就不会有网络调用。 */
  atomic<T>(work: () => T): T {
    // 已经在事务里：并入外层事务，一起提交或一起回滚
    if (this.db.isTransaction) return work()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = work()
      // 误传 async 函数时，第一个 await 之后的代码会跑到事务外面，所以直接拒绝
      if (value instanceof Promise) throw new Error('atomic() work must be synchronous')
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      // 抛错就整体回滚：Ticket、Subscription、Outbox 消息、effect 一起消失
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  get<T>(table: Table, id: string): T | undefined {
    const row = this.db.prepare(`SELECT value FROM ${table} WHERE id = ?`).get(id)
    return row ? JSON.parse(String(row.value)) as T : undefined
  }
  put(table: Table, id: string, value: unknown): void {
    this.db.prepare(`INSERT INTO ${table} (id, value) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value`)
      .run(id, JSON.stringify(value))
  }
  all<T>(table: Table): T[] {
    return this.db.prepare(`SELECT value FROM ${table} ORDER BY rowid`).all().map(row => JSON.parse(String(row.value)) as T)
  }

  /** Subscription 是 Thread 与 Ticket 的多对多关系，单独一张表。 */
  subscribe(thread: string, ticket: string): void {
    this.db.prepare('INSERT OR IGNORE INTO subscription (thread, ticket) VALUES (?, ?)').run(thread, ticket)
  }
  subscribers(thread: string): string[] {
    return this.db.prepare('SELECT ticket FROM subscription WHERE thread = ? ORDER BY rowid').all(thread).map(row => String(row.ticket))
  }

  /** Outbox：消息先落库，状态 pending；同一个 id 只记一次，返回是否新记了一条。 */
  queueMessage(message: OutboundMessage): boolean {
    const result = this.db.prepare(`INSERT OR IGNORE INTO outbox (id, value, status) VALUES (?, ?, 'pending')`)
      .run(message.id, JSON.stringify(message))
    return Number(result.changes) > 0
  }
  message(id: string): { message: OutboundMessage; status: string } | undefined {
    const row = this.db.prepare('SELECT value, status FROM outbox WHERE id = ?').get(id)
    return row ? { message: JSON.parse(String(row.value)) as OutboundMessage, status: String(row.status) } : undefined
  }
  markSent(id: string): void {
    this.db.prepare(`UPDATE outbox SET status = 'sent' WHERE id = ?`).run(id)
  }
  close(): void { this.db.close() }
}
