// Policy 与 Gate：Eval 的确定性第一层。
import type { Strength, Trigger } from './model.ts'

export interface Policy {
  allowed: string[]       // 允许名单：谁能让 agent 开工
}

// Gate 收到的类型里没有 text：在类型层面就读不到正文
export type GateInput = Omit<Trigger, 'text'>
export type GateResult =
  | { admissible: true; strength: Strength }
  | { admissible: false; reason: 'not_human' | 'not_a_member' | 'no_mention' }

/** 纯函数：只看"是不是人、在不在名单里、有没有 @"，从不看正文写了什么。 */
export function gate(trigger: GateInput, policy: Policy): GateResult {
  // bot、CI 和 agent 自己：不受理。上游会再走一遍 machineGate
  if (!trigger.human) return { admissible: false, reason: 'not_human' }
  const allowed = policy.allowed.some(login => login.toLowerCase() === trigger.actor.toLowerCase())
  if (!allowed) return { admissible: false, reason: 'not_a_member' }
  // 名单内 + @ 了 agent = explicit。上游的另外三种组合查准入表，这里一律不受理
  if (!trigger.addressed) return { admissible: false, reason: 'no_mention' }
  return { admissible: true, strength: 'explicit' }
}
