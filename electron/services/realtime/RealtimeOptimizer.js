// Real-time optimizer: runs in the main process while DarkHub is open (also hidden in the tray).
//   memory: every 5 s reads available memory (os.freemem: no process spawned); under real pressure it trims the
//           working sets of background processes through the native engine (never the foreground window).
//           A trim that frees little backs off exponentially, so a machine that is simply full is not hammered.
//   rules:  every 20 s, only when the user listed processes, one native process list (~15 ms): listed processes are
//           lowered to below-normal priority or closed. System processes and the foreground window are never touched.
import { EventEmitter } from 'node:events'
import os from 'node:os'

const MEMORY_TICK_MS = 5000
const RULES_TICK_MS = 20000
const LITTLE_FREED_MB = 64
const MAX_BACKOFF_MIN = 60
const LOG_SIZE = 200

/** Whether memory should be trimmed now. Pure: the caller passes the readings and the clock. */
export function shouldTrim({ availMb, totalMb, now, nextAllowedAt }, cfg) {
  if (!cfg.memory || !totalMb) return false
  return (availMb / totalMb) * 100 < cfg.memoryThresholdPct && now >= nextAllowedAt
}

/** Next cooldown after a trim: doubled while trims keep freeing little, reset when one helps. */
export function nextCooldownMin(currentMin, freedMb, cfg) {
  return freedMb < LITTLE_FREED_MB ? Math.min(MAX_BACKOFF_MIN, Math.max(cfg.cooldownMin, currentMin) * 2) : cfg.cooldownMin
}

/** Which listed processes to act on, and how. Pure. */
export function planRuleActions(processes, rules, { foregroundPid = -1, selfPid = -1, handled = new Set() } = {}) {
  if (!rules.length) return []
  const byName = new Map(rules.map((r) => [r.name, r.action]))
  const plan = []
  for (const p of processes) {
    if (p.pid <= 4 || p.pid === foregroundPid || p.pid === selfPid) continue
    const action = byName.get(`${String(p.name).toLowerCase()}.exe`)
    // "lower" is applied once per process; "close" acts again if the app relaunches (new pid)
    if (action && !handled.has(p.pid)) plan.push({ pid: p.pid, name: p.name, action })
  }
  return plan
}

export class RealtimeOptimizer extends EventEmitter {
  constructor({ native, getConfig, setPriority = os.setPriority, kill = process.kill.bind(process), memory = () => ({ availMb: os.freemem() / 1048576, totalMb: os.totalmem() / 1048576 }), now = Date.now } = {}) {
    super()
    Object.assign(this, { native, getConfig, setPriority, kill, memory, now })
    this.timers = []
    this.log = []
    this.stats = { trims: 0, freedMb: 0, lowered: 0, closed: 0, since: 0 }
    this.nextAllowedAt = 0
    this.cooldownMin = 0
    this.handled = new Set()
    this.busy = false
  }

  get running() { return this.timers.length > 0 }

  start() {
    if (this.running) return
    this.stats.since = this.now()
    this.cooldownMin = this.getConfig().cooldownMin
    for (const [fn, ms] of [[() => this.#memoryTick(), MEMORY_TICK_MS], [() => this.#rulesTick(), RULES_TICK_MS]]) {
      const t = setInterval(fn, ms)
      t.unref?.() // never keeps the process alive on its own
      this.timers.push(t)
    }
    this.#rulesTick()
    this.#record('info', 'started')
  }

  stop() {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
    this.handled.clear()
    this.#record('info', 'stopped')
  }

  status() {
    const { availMb, totalMb } = this.memory()
    return { running: this.running, stats: this.stats, memory: { availMb: Math.round(availMb), totalMb: Math.round(totalMb) }, nextTrimAt: this.nextAllowedAt, log: this.log.slice(-50) }
  }

  #record(level, event, data = {}) {
    const entry = { at: this.now(), level, event, ...data }
    this.log.push(entry)
    if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE)
    this.emit('event', entry)
  }

  async #memoryTick() {
    const cfg = this.getConfig()
    const before = this.memory()
    if (this.busy || !shouldTrim({ ...before, now: this.now(), nextAllowedAt: this.nextAllowedAt }, cfg)) return
    this.busy = true
    try {
      const res = await this.native.cleanRam(process.pid, cfg.minProcessMb)
      // let the memory manager settle before measuring what actually became available
      await new Promise((r) => setTimeout(r, 1500))
      const freedMb = Math.max(0, Math.round(this.memory().availMb - before.availMb))
      this.cooldownMin = nextCooldownMin(this.cooldownMin, freedMb, cfg)
      this.nextAllowedAt = this.now() + this.cooldownMin * 60000
      this.stats.trims++
      this.stats.freedMb += freedMb
      this.#record('action', 'memory-trim', { freedMb, processes: res?.processes_cleaned ?? 0, availPct: Math.round((before.availMb / before.totalMb) * 100), nextInMin: this.cooldownMin })
    } catch (e) {
      this.nextAllowedAt = this.now() + cfg.cooldownMin * 60000
      this.#record('error', 'memory-trim', { error: String(e?.message ?? e) })
    } finally {
      this.busy = false
    }
  }

  async #rulesTick() {
    const { rules } = this.getConfig()
    if (!rules.length) return
    const list = await this.native.listProcesses().catch(() => null)
    if (!list) return
    const alive = new Set(list.processes.map((p) => p.pid))
    for (const pid of this.handled) if (!alive.has(pid)) this.handled.delete(pid)
    for (const step of planRuleActions(list.processes, rules, { foregroundPid: list.foregroundPid, selfPid: process.pid, handled: this.handled })) {
      try {
        if (step.action === 'close') { this.kill(step.pid); this.stats.closed++ } else { this.setPriority(step.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); this.stats.lowered++ }
        this.handled.add(step.pid)
        this.#record('action', step.action === 'close' ? 'process-closed' : 'process-lowered', { name: step.name, pid: step.pid })
      } catch (e) {
        this.handled.add(step.pid) // access denied etc.: do not retry every tick
        this.#record('error', 'process-rule', { name: step.name, pid: step.pid, error: String(e?.code || e?.message || e) })
      }
    }
  }
}
