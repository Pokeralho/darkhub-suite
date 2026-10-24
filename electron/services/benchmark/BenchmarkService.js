// Before/after benchmark: runs benchWorker.js in Electron-as-Node, records the system context with every run,
// keeps history in userData and compares two runs against their measured noise.
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summarize, compare, contextWarnings } from './benchStats.js'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'benchWorker.js')
const MAX_RUNS = 100

const exec = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: 10000 }, (err, stdout) => resolve(err ? '' : String(stdout)))
})

/** Busy share of all cores over one second (0-100), measured before the benchmark starts. */
async function backgroundCpu() {
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t } }, { idle: 0, total: 0 })
  const a = snap()
  await new Promise((r) => setTimeout(r, 1000))
  const b = snap()
  return Math.round(100 * (1 - (b.idle - a.idle) / Math.max(1, b.total - a.total)))
}

async function context() {
  // powercfg prints in the console code page: run it through PowerShell with UTF-8 output so accents survive
  const ps = (cmd) => exec('powershell.exe', ['-NoProfile', '-Command', `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); ${cmd}`])
  const plan = (await ps('powercfg /getactivescheme')).match(/\(([^)]+)\)\s*$/m)?.[1] ?? null
  const battery = await ps('(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus')
  return {
    powerPlan: plan,
    // BatteryStatus 1 = discharging; no battery = desktop on AC
    onBattery: battery.trim() === '1',
    cpu: os.cpus()[0]?.model?.trim() ?? null,
    threads: os.cpus().length,
    ramGb: Math.round(os.totalmem() / 1073741824),
    osBuild: os.release(),
    backgroundCpu: await backgroundCpu()
  }
}

export class BenchmarkService {
  constructor({ app, onEvent }) {
    this.file = path.join(app.getPath('userData'), 'benchmarks.json')
    this.onEvent = onEvent
    this.child = null
  }

  history() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return [] } }
  _save(list) { fs.writeFileSync(this.file, JSON.stringify(list.slice(0, MAX_RUNS), null, 1)) }

  async run({ label = '', quick = false, skipDisk = false, diskDir = '' } = {}) {
    if (this.child) return { ok: false, error: 'Um benchmark já está rodando' }
    const ctx = await context()
    const args = JSON.stringify({ runs: quick ? 3 : 5, quick, skipDisk, diskDir })
    const started = Date.now()
    const result = await new Promise((resolve) => {
      // Electron as plain Node: same binary, no window, reads this file from the app (asar included)
      const child = spawn(process.execPath, [WORKER, args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
      this.child = child
      let buf = ''
      let out = null
      child.stdout.on('data', (d) => {
        buf += d
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1)
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'progress') this.onEvent?.({ type: 'progress', test: msg.test, run: msg.run, runs: msg.runs })
            else out = msg
          } catch { /* partial line */ }
        }
      })
      child.on('close', (code) => {
        this.child = null
        resolve(out ?? { type: 'error', error: code === null ? 'cancelled' : `exit ${code}` })
      })
    })
    if (result.type !== 'result') return { ok: false, error: result.error }
    const entry = { id: `b${started}`, at: started, ms: Date.now() - started, label: String(label).slice(0, 80), quick, context: ctx, metrics: summarize(result.samples) }
    this._save([entry, ...this.history()])
    return { ok: true, run: entry }
  }

  cancel() {
    if (this.child) { try { this.child.kill() } catch { /* gone */ } }
    return { ok: true }
  }

  compare(aId, bId) {
    const list = this.history()
    const a = list.find((x) => x.id === aId)
    const b = list.find((x) => x.id === bId)
    if (!a || !b) return { ok: false, error: 'Execução não encontrada' }
    return { ok: true, rows: compare(a.metrics, b.metrics), warnings: contextWarnings(a.context, b.context) }
  }

  remove(id) {
    this._save(this.history().filter((x) => x.id !== id))
    return { ok: true }
  }
}
