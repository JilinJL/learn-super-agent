// 持久化的副作用队列：在命令的事务里写入，事务提交后才执行，失败按退避重试。
import type { Store } from './store.ts'

export type Handler = (payload: Record<string, unknown>, key: string) => Promise<void>
interface Row { kind: string; key: string; value: string; generation: number; attempts: number }

/** 第一次重试等 1 秒，之后每次翻倍，最多等 60 秒。 */
export const RETRY = { first: 1000, max: 60_000 }

export class Effects {
  private readonly handlers = new Map<string, Handler>()
  private readonly store: Store
  private readonly now: () => number
  private seq: number
  constructor(store: Store, now: () => number = Date.now) {
    this.store = store
    this.now = now
    // 重启后接着原来的队尾编号，保证先进先出
    this.seq = Number(store.db.prepare('SELECT IFNULL(MAX(seq), 0) AS seq FROM effect').get()?.seq ?? 0)
  }
  handle(kind: string, run: Handler): void { this.handlers.set(kind, run) }

  /** 在调用方的事务里写一行。同一 kind + key 已在排队时合并成一行，generation 加一。 */
  enqueue(kind: string, key: string, payload: Record<string, unknown>): void {
    this.store.db.prepare(`INSERT INTO effect (kind, key, value, seq, due) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(kind, key) DO UPDATE SET value = excluded.value, generation = generation + 1, attempts = 0, due = excluded.due`)
      .run(kind, key, JSON.stringify(payload), ++this.seq, this.now())
  }

  /** 跑一遍到期的 effect，返回成功的个数。一次只跑一个，按入队顺序。 */
  async runDue(): Promise<number> {
    const rows = this.store.db.prepare('SELECT kind, key, value, generation, attempts FROM effect WHERE due <= ? ORDER BY seq')
      .all(this.now()) as unknown as Row[]
    let done = 0
    for (const row of rows) {
      const run = this.handlers.get(row.kind)
      if (!run) continue
      // 只删改自己读到的那一版：运行期间被重新排队的行（generation 变了）留给下一轮
      const own = 'kind = ? AND key = ? AND generation = ?'
      try {
        await run(JSON.parse(row.value) as Record<string, unknown>, row.key)
        this.store.db.prepare(`DELETE FROM effect WHERE ${own}`).run(row.kind, row.key, row.generation)
        done++
      } catch (error) {
        const delay = Math.min(RETRY.max, RETRY.first * 2 ** row.attempts)
        this.store.db.prepare(`UPDATE effect SET attempts = attempts + 1, error = ?, due = ? WHERE ${own}`)
          .run(String(error).slice(0, 500), this.now() + delay, row.kind, row.key, row.generation)
      }
    }
    return done
  }

  /** 一直跑，直到没有到期的 effect 能成功。effect 里排出的新 effect（launch 之后的回复）也会在这里跑完。 */
  async idle(): Promise<void> {
    while (await this.runDue() > 0) { /* 继续下一轮 */ }
  }
}
