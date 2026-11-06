// Assessor 与 worker 的占位实现。换成模型调用时，函数签名不变。
import type { Assessor, Worker } from './engine.ts'

/** 上游的主 Session：判断接不接、范围多大。这里只用规则：Thread 上已有进行中的 Ticket 就当作重复。 */
export const stubAssessor: Assessor = async candidate => {
  if (candidate.tickets.some(ticket => !ticket.ended)) return { kind: 'ignore', reason: 'duplicate' }
  // 去掉 @ 之后的第一行当标题和范围
  const title = candidate.primary.text.replace(/@[\w-]+/g, '').trim().split('\n')[0]!.slice(0, 80) || 'Untitled request'
  return { kind: 'accept', title, scope: title, acknowledgement: `This is by an automated agent, not a human. 我来处理：${title}` }
}

/** 上游的执行器 Session：在自己的目录里干活。这里只是打印收到了什么，然后报告 ready。 */
export const stubWorker: Worker = async job => {
  const said = job.inputs.map(trigger => `${trigger.actor}: ${trigger.text}`).join('\n')
  console.log(`[worker] ${job.first ? 'launch' : 'follow-up'} ${job.ticket.title}\n${said}`)
  return { state: 'ready', summary: `This is by an automated agent, not a human. 已完成：${job.ticket.title}` }
}
