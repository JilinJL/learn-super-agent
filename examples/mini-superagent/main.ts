// 入口：组装各部分，然后每隔几秒跑一轮"轮询 → Eval → effects"。
import { parseArgs } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { Effects } from './effects.ts'
import { Engine } from './engine.ts'
import { GhSource } from './source.ts'
import { Store } from './store.ts'
import { stubAssessor, stubWorker } from './stubs.ts'

const { values } = parseArgs({ options: {
  repo: { type: 'string' }, agent: { type: 'string' }, allow: { type: 'string' },
  db: { type: 'string', default: 'mini-superagent.db' }, interval: { type: 'string', default: '10' },
} })
if (!values.repo || !values.agent || !values.allow) {
  console.error('Usage: node main.ts --repo owner/name --agent <bot-login> --allow alice,bob [--db file] [--interval seconds]')
  process.exit(2)
}
const allowed = values.allow.split(',').map(login => login.trim()).filter(Boolean)
const store = new Store(values.db)
const effects = new Effects(store)
const source = new GhSource(values.repo, values.agent)
const engine = new Engine({ store, effects, source, policy: () => ({ allowed }), assessor: stubAssessor, worker: stubWorker })

let stopping = false
process.on('SIGINT', () => { stopping = true })
console.log(`Watching ${values.repo} as ${values.agent}; allowed: ${allowed.join(', ')}`)
// 先跑一遍：重启前没做完的 effect 在这里接着做
await effects.idle()
while (!stopping) {
  try {
    for (const trigger of await source.poll()) {
      const result = engine.receive(trigger)
      if (result !== 'duplicate') console.log(`[intake] ${trigger.thread} ${trigger.actor}: ${result}`)
    }
  } catch (error) { console.error(`[poll] ${String(error)}`) }
  engine.evaluateDue()
  await effects.idle()
  await sleep(Number(values.interval) * 1000)
}
store.close()
