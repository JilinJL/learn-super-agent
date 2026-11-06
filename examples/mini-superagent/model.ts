// 领域模型：上游十个概念里留下的几个，以及由内容派生的 id。
import { createHash } from 'node:crypto'

/** 由内容派生的稳定 id：相同输入永远得到相同 id。去重和幂等都靠它。 */
export function key(...values: string[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 32)
}

/** Source 产生的一条不可变事件。text 是不可信的外部数据。 */
export interface Trigger {
  id: string
  thread: string          // 所属 Thread 的 key，例如 github:42。上游允许一个 Trigger 属于多个 Thread
  actor: string           // 发送者在 Source 里的账号
  human: boolean          // Source 声明的事实：是人写的，不是 bot，也不是 agent 自己
  addressed: boolean      // Source 声明的事实：正文 @ 了 agent
  at: string
  text: string
  channel: Channel        // 以后往哪里回话
}
/** 回话的地址。这里只有 GitHub，所以只需要 Issue 或 PR 的编号。 */
export interface Channel { number: number }

/** 一个 Thread：排队等 Eval 的 Trigger，以及进行中的 Eval（最多一个）。 */
export interface Thread {
  key: string
  pending: string[]
  evaluating?: Evaluation
}
export interface Evaluation { id: string; triggerIds: string[]; primary: string; strength: Strength }

/** 上游还有 'inferred'（推断），见第 11 章练习 1。 */
export type Strength = 'explicit'
export interface Mandate { strength: Strength; actor: string; scope: string }

export interface Decision {
  id: string
  thread: string
  evalId: string
  kind: 'accept' | 'ignore'
  triggerIds: string[]
  reasons?: { triggerId: string; code: string }[]
  ticketId?: string
  at: string
}

export interface Ticket {
  id: string
  title: string
  decisionId: string
  mandate: Mandate
  channel: Channel
  origin: string[]        // 开单的那批 Trigger
  inputs: string[]        // 扇出来的跟进
  undelivered: string[]   // 还没交给 worker 的跟进
  reports: WorkerReport[]
  ended?: { outcome: 'completed'; at: string }
  createdAt: string
}

export interface WorkerReport { state: 'ready' | 'waiting'; summary: string }
export interface OutboundMessage { id: string; channel: Channel; text: string; ticketId: string }
