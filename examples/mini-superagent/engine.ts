// Engine：唯一的写入入口。每个公开命令是一个同步事务，副作用只排进 effect 表。
import { key } from './model.ts'
import type { Decision, Evaluation, Mandate, OutboundMessage, Strength, Thread, Ticket, Trigger, WorkerReport } from './model.ts'
import { gate, type Policy } from './policy.ts'
import type { Effects } from './effects.ts'
import type { Store } from './store.ts'
import type { Source } from './source.ts'

/** Assessor 看到的候选：一批 Trigger、Gate 给出的强度、这个 Thread 上的 Ticket（用来判断重复），不带任何权限。 */
export interface Candidate { evalId: string; thread: string; triggers: Trigger[]; primary: Trigger; strength: Strength; tickets: Ticket[] }
export type Outcome =
  | { kind: 'accept'; title: string; scope: string; acknowledgement: string }
  | { kind: 'ignore'; reason: string }
/** 可替换成模型调用：上游的主 Session。 */
export type Assessor = (candidate: Candidate) => Promise<Outcome>
export interface Job { ticket: Ticket; inputs: Trigger[]; first: boolean }
/** 可替换成 coding agent：上游的执行器 Session。 */
export type Worker = (job: Job) => Promise<WorkerReport>
export type ReceiveResult = 'duplicate' | 'queued' | 'followup'

export interface EngineOptions {
  store: Store
  effects: Effects
  policy: () => Policy
  assessor: Assessor
  worker: Worker
  source: Pick<Source, 'send'>
  now?: () => string
}

export class Engine {
  private readonly store: Store
  private readonly effects: Effects
  private readonly options: EngineOptions
  private readonly now: () => string
  constructor(options: EngineOptions) {
    this.options = options
    this.store = options.store
    this.effects = options.effects
    this.now = options.now ?? (() => new Date().toISOString())
    this.effects.handle('assess', payload => this.assess(String(payload.evalId)))
    this.effects.handle('launch', payload => this.work(String(payload.ticketId), true))
    this.effects.handle('deliver', payload => this.work(String(payload.ticketId), false))
    this.effects.handle('reply', (_payload, id) => this.send(id))
  }

  /** Source 交来一个 Trigger：去重、存储、扇出给订阅的 Ticket；没有 Ticket 收下时排队等 Eval。 */
  receive(trigger: Trigger): ReceiveResult {
    return this.store.atomic(() => {
      // ① 去重：id 只由评论内容决定，同一条评论轮询多少次都是同一个 id
      if (this.store.get('trigger', trigger.id)) return 'duplicate'
      this.store.put('trigger', trigger.id, trigger)
      // ② 扇出：订阅了这个 Thread、还没结束的 Ticket 直接收下这条消息
      const reached = this.store.subscribers(trigger.thread).map(id => this.ticket(id)).filter(ticket => !ticket.ended)
      for (const ticket of reached) {
        ticket.inputs.push(trigger.id)
        ticket.undelivered.push(trigger.id)
        this.store.put('ticket', ticket.id, ticket)
        this.effects.enqueue('deliver', ticket.id, { ticketId: ticket.id })
      }
      // ③ 人的跟进归 Ticket 的 worker 处理，不进 Eval，也就不会开出第二个 Ticket
      if (reached.length && trigger.human) return 'followup'
      const thread = this.loadThread(trigger.thread)
      thread.pending.push(trigger.id)
      this.store.put('thread', thread.key, thread)
      return 'queued'
    })
  }

  /** 时钟驱动：给有排队消息、且没有 Eval 在跑的 Thread 开始一轮 Eval。每个 Thread 一个事务。 */
  evaluateDue(): void {
    for (const thread of this.store.all<Thread>('thread')) {
      if (thread.pending.length && !thread.evaluating) this.store.atomic(() => this.start(thread.key))
    }
  }

  private start(threadKey: string): void {
    const thread = this.loadThread(threadKey)
    const batch = thread.pending.map(id => this.trigger(id))
    thread.pending = []
    const reasons: { triggerId: string; code: string }[] = []
    let primary: { trigger: Trigger; strength: Strength } | undefined
    for (const trigger of batch) {
      // 交给 Gate 之前先拿掉正文：Gate 想读也读不到
      const { text: _text, ...facts } = trigger
      const result = gate(facts, this.options.policy())
      // 只有一种强度，所以最后一条合格的胜出。上游按强度取最强，强度相同取最晚
      if (result.admissible) primary = { trigger, strength: result.strength }
      else reasons.push({ triggerId: trigger.id, code: result.reason })
    }
    const evaluation: Evaluation = { id: key('eval', threadKey, ...batch.map(trigger => trigger.id)),
      triggerIds: batch.map(trigger => trigger.id), primary: (primary?.trigger ?? batch.at(-1)!).id, strength: primary?.strength ?? 'explicit' }
    // 一条都没过 Gate：记一条 ignore Decision，连 Assessor 都不叫
    if (!primary) {
      this.store.put('thread', thread.key, thread)
      this.record(threadKey, evaluation, 'ignore', { reasons })
      return
    }
    thread.evaluating = evaluation
    this.store.put('thread', thread.key, thread)
    // 只是排一个 effect：模型调用发生在事务提交之后
    this.effects.enqueue('assess', evaluation.id, { evalId: evaluation.id })
  }

  /** Assessor 的结论回到这里。accept 的全部写入都在这一个事务里。 */
  decide(evalId: string, outcome: Outcome): Decision {
    return this.store.atomic(() => {
      const thread = this.store.all<Thread>('thread').find(item => item.evaluating?.id === evalId)
      // Eval 已经结束：拒绝。重放的结论不会开出第二个 Ticket
      if (!thread?.evaluating) throw new Error(`Eval ${evalId} has finished`)
      const evaluation = thread.evaluating
      delete thread.evaluating
      this.store.put('thread', thread.key, thread)
      if (outcome.kind === 'ignore') {
        return this.record(thread.key, evaluation, 'ignore', { reasons: [{ triggerId: evaluation.primary, code: outcome.reason }] })
      }
      return this.accept(thread.key, evaluation, outcome)
    })
  }

  private accept(threadKey: string, evaluation: Evaluation, outcome: Extract<Outcome, { kind: 'accept' }>): Decision {
    const primary = this.trigger(evaluation.primary)
    // 强度和发起人来自 Gate，范围来自模型：模型决定做什么，不能决定凭什么做
    const mandate: Mandate = { strength: evaluation.strength, actor: primary.actor, scope: outcome.scope }
    // Ticket id 由 Eval id 派生：同一个 Eval 只可能对应同一个 Ticket
    const ticketId = key('ticket', evaluation.id)
    const decision = this.record(threadKey, evaluation, 'accept', { ticketId })
    const ticket: Ticket = { id: ticketId, title: outcome.title, decisionId: decision.id, mandate, channel: primary.channel,
      origin: evaluation.triggerIds, inputs: [], undelivered: [], reports: [], createdAt: this.now() }
    this.store.put('ticket', ticketId, ticket)
    // Subscription：这个 Thread 之后的消息会扇出给这个 Ticket
    this.store.subscribe(threadKey, ticketId)
    // 确认回复和启动 worker 都只是写一行，事务回滚时它们一起消失
    this.queueReply(ticket, 'ack', outcome.acknowledgement)
    this.effects.enqueue('launch', ticketId, { ticketId })
    return decision
  }

  /** worker 的报告。ready 结束 Ticket 并排一条结果回复；waiting 保持安静。 */
  report(ticketId: string, report: WorkerReport, delivered: string[]): Ticket {
    return this.store.atomic(() => {
      const ticket = this.ticket(ticketId)
      ticket.undelivered = ticket.undelivered.filter(id => !delivered.includes(id))
      ticket.reports.push(report)
      if (report.state === 'ready') {
        ticket.ended = { outcome: 'completed', at: this.now() }
        this.queueReply(ticket, `report:${ticket.reports.length}`, report.summary)
      }
      this.store.put('ticket', ticketId, ticket)
      return ticket
    })
  }

  candidate(evalId: string): Candidate | undefined {
    const thread = this.store.all<Thread>('thread').find(item => item.evaluating?.id === evalId)
    if (!thread?.evaluating) return undefined
    const { evaluating } = thread
    return { evalId, thread: thread.key, triggers: evaluating.triggerIds.map(id => this.trigger(id)),
      primary: this.trigger(evaluating.primary), strength: evaluating.strength,
      tickets: this.store.subscribers(thread.key).map(id => this.ticket(id)) }
  }
  thread(key: string): Thread | undefined { return this.store.get<Thread>('thread', key) }
  tickets(): Ticket[] { return this.store.all<Ticket>('ticket') }
  decisions(): Decision[] { return this.store.all<Decision>('decision') }

  // 以下是 effect 的处理函数，在事务之外运行，可以 await

  private async assess(evalId: string): Promise<void> {
    const candidate = this.candidate(evalId)
    // Eval 已经结束（比如重启前已经决定过）：什么都不做，effect 正常删除
    if (!candidate) return
    this.decide(evalId, await this.options.assessor(candidate))
  }

  private async work(ticketId: string, first: boolean): Promise<void> {
    // 每次都从库里重新读：await 期间 Ticket 可能已经变了
    const ticket = this.store.get<Ticket>('ticket', ticketId)
    if (!ticket || ticket.ended) return
    // launch 已经报告过（重启前做完、还没来得及删 effect）：不再做第二遍
    if (first && ticket.reports.length) return
    // 还没 launch 就来了跟进：留给 launch 一起带上
    if (!first && !ticket.reports.length) return
    const taken = [...ticket.undelivered]
    if (!first && !taken.length) return
    const inputs = (first ? [...ticket.origin, ...taken] : taken).map(id => this.trigger(id))
    const report = await this.options.worker({ ticket, inputs, first })
    this.report(ticketId, report, taken)
  }

  private async send(id: string): Promise<void> {
    const queued = this.store.message(id)
    if (!queued || queued.status === 'sent') return
    await this.options.source.send(queued.message)
    this.store.markSent(id)
  }

  private queueReply(ticket: Ticket, purpose: string, text: string): void {
    // 消息 id 由 Ticket 和用途决定：同一条回复排两次也只记一次
    const message: OutboundMessage = { id: key('message', ticket.id, purpose), channel: ticket.channel, text, ticketId: ticket.id }
    if (this.store.queueMessage(message)) this.effects.enqueue('reply', message.id, {})
  }

  private record(thread: string, evaluation: Evaluation, kind: Decision['kind'], extra: Partial<Decision>): Decision {
    const decision: Decision = { id: key('decision', evaluation.id), thread, evalId: evaluation.id, kind,
      triggerIds: evaluation.triggerIds, at: this.now(), ...extra }
    this.store.put('decision', decision.id, decision)
    return decision
  }
  private loadThread(key: string): Thread { return this.store.get<Thread>('thread', key) ?? { key, pending: [] } }
  private trigger(id: string): Trigger { return this.store.get<Trigger>('trigger', id)! }
  private ticket(id: string): Ticket { return this.store.get<Ticket>('ticket', id)! }
}
