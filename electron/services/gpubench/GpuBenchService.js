// Runs the native GPU benchmark engine and, for ranked runs, relays it to the Hub. The engine never talks to the network
// and this file decides nothing about the score of a ranked run: the server does. See docs/GPU_BENCHMARK.md.
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { OFFICIAL_HUB } from '../hub/hubKeys.js'
import { integrityError } from '../binaryIntegrity.js'
import { SCENE_VERSION } from './sceneModel.js'
import { decodeFrameUs, driverFlags, frameStats, localPlan, sampleGpu, scoreOf, sensorSummary, LOCAL_SEGMENT_MS, MAX_HISTORY, WARM_MS } from './gpuBenchModel.js'
import { isDeviceLost, normalizeStress, stressPlan, summarizeStress, CHECK_FRAME, LOOP_MS } from './stressModel.js'

const here = path.dirname(fileURLToPath(import.meta.url))

export function enginePath() {
  const p = path.join(here, '..', 'DarkHub.GpuBench.exe')
  return p.includes(`app.asar${path.sep}`) ? p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : p
}

/** One running engine process: send a command, await the next line it answers. */
class Engine {
  constructor(exe, spawnImpl, { parent = null, onTick = null } = {}) {
    this.onTick = onTick
    this.child = spawnImpl(exe, parent ? ['--parent', String(parent)] : [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: false })
    this.lines = readline.createInterface({ input: this.child.stdout })[Symbol.asyncIterator]()
    this.closed = new Promise((resolve) => { this.child.once('close', () => resolve(null)); this.child.once('error', () => resolve(null)) })
  }

  async next() {
    let msg
    do {
      const line = await Promise.race([this.lines.next().then((r) => (r.done ? null : r.value)), this.closed])
      if (line == null) throw new Error('cancelled')
      msg = JSON.parse(line)
      if (msg.type === 'tick') this.onTick?.(msg)
    } while (msg.type === 'tick')
    if (msg.type === 'aborted') throw new Error('cancelled')
    if (msg.type === 'error') throw new Error(msg.error)
    return msg
  }

  send(cmd) { this.child.stdin.write(`${JSON.stringify(cmd)}\n`) }

  ask(cmd) {
    this.send(cmd)
    return this.next()
  }

  stop() {
    try { this.child.stdin.end() } catch { /* gone */ }
    setTimeout(() => { try { this.child.kill() } catch { /* gone */ } }, 1500).unref?.()
  }

  kill() { try { this.child.kill() } catch { /* gone */ } }
}

export class GpuBenchService {
  /** deps: { app, safeStorage, shell, hardware, onEvent, fetchImpl, spawnImpl, exe, toJpeg } */
  constructor({ app, safeStorage, shell, hardware, onEvent, fetchImpl = globalThis.fetch, spawnImpl = spawn, exe = enginePath(), toJpeg = null, integrity = null, logger = null }) {
    Object.assign(this, { app, safeStorage, shell, hardware, onEvent, fetch: fetchImpl, spawnImpl, exe, toJpeg, integrity, logger })
    const dir = app.getPath('userData')
    this.historyFile = path.join(dir, 'gpubench.json')
    this.stressFile = path.join(dir, 'gpubench-stress.json')
    this.tokenFile = path.join(dir, 'gpubench.token')
    this.serverFile = path.join(dir, 'hub', 'server.json')
    this.engine = null
    this.pairing = null
  }

  // ------------------------------------------------------------------ state
  hubUrl() {
    try { const s = JSON.parse(fs.readFileSync(this.serverFile, 'utf8')); if (s.url) return s.url } catch { /* default */ }
    return OFFICIAL_HUB
  }

  history() { try { return JSON.parse(fs.readFileSync(this.historyFile, 'utf8')) } catch { return [] } }
  _save(list) { fs.writeFileSync(this.historyFile, JSON.stringify(list.slice(0, MAX_HISTORY), null, 1)) }
  remove(id) { this._save(this.history().filter((x) => x.id !== id)); return { ok: true } }

  stressHistory() { try { return JSON.parse(fs.readFileSync(this.stressFile, 'utf8')) } catch { return [] } }
  removeStress(id) { fs.writeFileSync(this.stressFile, JSON.stringify(this.stressHistory().filter((x) => x.id !== id), null, 1)); return { ok: true } }

  _token() {
    try { return this.safeStorage.isEncryptionAvailable() ? this.safeStorage.decryptString(fs.readFileSync(this.tokenFile)) : null } catch { return null }
  }

  status() {
    const supported = process.platform === 'win32'
    return {
      ok: true,
      supported,
      unsupported: !supported,
      platform: process.platform,
      reason: supported ? undefined : 'windows-only',
      engine: supported ? fs.existsSync(this.exe) : false,
      running: Boolean(this.engine),
      linked: Boolean(this._token()),
      canStoreToken: Boolean(this.safeStorage?.isEncryptionAvailable?.()),
      hub: this.hubUrl(),
      runs: this.history(),
      stress: this.stressHistory()
    }
  }

  /** Where the engine draws, in physical pixels of the app window. Remembered: the screen may report it before the engine is up. */
  viewport(rect) {
    this.rect = rect
    try { this.engine?.send({ cmd: 'rect', ...rect }) } catch { /* closing */ }
    return { ok: true }
  }

  /** Null when the engine on disk is the one this version shipped; an installed app refuses anything else. */
  _engineIntegrity() {
    return integrityError(['DarkHub.GpuBench.exe'], { ...this.integrity, log: (m) => this.logger?.warn?.('GpuBench', m) })
  }

  _startEngine(parent) {
    const engine = new Engine(this.exe, this.spawnImpl, { parent, onTick: (t) => this.onEvent?.({ type: 'tick', fps: t.fps }) })
    this.engine = engine
    return engine
  }

  /** The best of the public ranking. It needs no account; an unreachable Hub is a normal state for the screen. */
  async ranking({ test = 'total', limit = 5 } = {}) {
    const kind = ['total', 'raster', 'rt'].includes(test) ? test : 'total'
    try {
      const data = await this._api('GET', `/ranking?test=${kind}`, undefined, null)
      return { ok: true, test: kind, items: (data.items || []).slice(0, limit).map((r) => ({ rank: r.rank, runId: r.runId, login: r.login, gpu: r.gpu, score: r.score })) }
    } catch (e) {
      return { ok: false, error: 'unavailable', detail: e.message }
    }
  }

  rankingUrl() { return `${this.hubUrl()}/ranking` }

  async openRanking(id) {
    await this.shell.openExternal(id ? `${this.hubUrl()}/ranking/${encodeURIComponent(id)}` : this.rankingUrl())
    return { ok: true }
  }

  // ------------------------------------------------------------------ Hub
  async _api(method, url, body, token = this._token()) {
    const res = await this.fetch(`${this.hubUrl()}/api/bench${url}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(data.error || `hub ${res.status}`), { status: res.status })
    return data
  }

  /** Device pairing: the user approves in the browser, the app receives a Hub token. It is stored encrypted, never shown. */
  async link() {
    if (!this.safeStorage?.isEncryptionAvailable?.()) return { ok: false, error: 'no_secure_storage' }
    const p = await this._api('POST', '/pair', {}, null).catch(() => null)
    if (!p) return { ok: false, error: 'hub_unavailable' }
    await this.shell.openExternal(p.url)
    this.onEvent?.({ type: 'link', code: p.code })
    const token = { cancelled: false }
    this.pairing = token
    const until = Date.now() + Number(p.expiresIn || 600) * 1000
    while (Date.now() < until && !token.cancelled) {
      await new Promise((r) => setTimeout(r, 2500))
      const r = await this._api('POST', '/pair/poll', { deviceCode: p.deviceCode }, null).catch(() => null)
      if (r?.token) {
        fs.writeFileSync(this.tokenFile, this.safeStorage.encryptString(r.token))
        return { ok: true }
      }
    }
    return { ok: false, error: token.cancelled ? 'cancelled' : 'expired' }
  }

  unlink() {
    if (this.pairing) this.pairing.cancelled = true
    fs.rmSync(this.tokenFile, { force: true })
    return { ok: true }
  }

  // ------------------------------------------------------------------ runs
  cancel() { this.stopReason ||= 'cancelled'; this.engine?.kill(); return { ok: true } }

  _sensorSample() { return sampleGpu(this.hardware?.snapshot?.()) }

  async run({ ranked = false, quick = false, label = '', parent = null } = {}) {
    if (process.platform !== 'win32' && this.spawnImpl === spawn) return { ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Benchmark de GPU (D3D12/DXR) é suportado apenas no Windows.' }
    if (this.engine) return { ok: false, error: 'already_running' }
    if (!fs.existsSync(this.exe)) return { ok: false, error: 'engine_missing' }
    if (ranked && !this._token()) return { ok: false, error: 'not_linked' }
    if (this._engineIntegrity()) return { ok: false, error: 'integrity_failed' }
    this.stopReason = null

    const engine = this._startEngine(parent)
    const samples = []
    const sampler = setInterval(() => samples.push(this._sensorSample()), 1000)
    this.hardware?.holdSensors?.('gpubench')
    try {
      const ready = await engine.next()
      if (this.rect) engine.send({ cmd: 'rect', ...this.rect })
      const stats = {}
      const us = { raster: [], rt: [] }
      const tests = ready.dxr ? ['raster', 'rt'] : ['raster']
      const warm = async () => {
        for (const test of tests) {
          this.onEvent?.({ type: 'progress', phase: 'warm', test, index: 0, total: 0 })
          await engine.ask({ cmd: 'segment', test, seed: crypto.randomInt(2 ** 32), index: -1, ms: WARM_MS })
        }
      }
      const record = (seg) => us[seg.test].push(...decodeFrameUs(seg.frameUs))

      let server = null
      let localDriver = null
      if (ranked) server = await this._rankedRun(engine, ready, warm, record, samples)
      else {
        await warm()
        const plan = localPlan({ dxr: ready.dxr, quick })
        for (let i = 0; i < plan.length; i++) {
          this.onEvent?.({ type: 'progress', phase: 'run', test: plan[i].test, index: i + 1, total: plan.length })
          record(await engine.ask({ cmd: 'segment', ...plan[i], seed: crypto.randomInt(2 ** 32), ms: LOCAL_SEGMENT_MS }))
        }
        localDriver = await engine.ask({ cmd: 'driver' }).catch(() => null)
      }

      for (const t of tests) stats[t] = frameStats(us[t])
      const local = scoreOf({ rasterFps: stats.raster.fps, rtFps: stats.rt?.fps ?? null })
      const entry = {
        id: server?.runId ?? `g${Date.now()}`, at: Date.now(), label: String(label).slice(0, 80), quick: !ranked && quick,
        sceneVersion: SCENE_VERSION, status: server?.status ?? 'local', flags: server?.flags ?? [],
        score: server?.score ?? local, stats,
        gpu: { name: ready.adapter, vendorId: ready.vendorId, deviceId: ready.deviceId, vramMb: ready.vramMb, driver: ready.driver, dxr: ready.dxr },
        sensors: sensorSummary(samples),
        driver: driverFlags(server?.driver ?? localDriver)
      }
      this._save([entry, ...this.history()])
      return { ok: true, run: entry }
    } catch (e) {
      return { ok: false, error: e.message === 'cancelled' ? 'cancelled' : e.message }
    } finally {
      clearInterval(sampler)
      this.hardware?.releaseSensors?.('gpubench')
      engine.stop()
      this.engine = null
      this.rect = null
    }
  }

  /**
   * Stress test, local only. Loops the load, watches the temperature every second and re-renders one fixed frame after
   * each loop: it must match the reference taken at the start. `loopMs` exists for tests; the screen never sets it.
   */
  async stress(options = {}, { loopMs = LOOP_MS, warmMs = WARM_MS, parent = null } = {}) {
    if (process.platform !== 'win32' && this.spawnImpl === spawn) return { ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Stress de GPU (D3D12) é suportado apenas no Windows.' }
    if (this.engine) return { ok: false, error: 'already_running' }
    if (!fs.existsSync(this.exe)) return { ok: false, error: 'engine_missing' }
    if (this._engineIntegrity()) return { ok: false, error: 'integrity_failed' }
    const opts = normalizeStress(options)
    const engine = this._startEngine(parent)
    this.stopReason = null
    const samples = []
    const sampler = setInterval(() => {
      const s = this._sensorSample()
      samples.push(s)
      if (s.temp != null && s.temp >= opts.tempLimit) { this.stopReason ||= 'temp_limit'; engine.kill() }
    }, 1000)
    this.hardware?.holdSensors?.('gpustress')

    const loops = []
    let plan = null
    let gpu = null
    try {
      const ready = await engine.next()
      if (this.rect) engine.send({ cmd: 'rect', ...this.rect })
      gpu = { name: ready.adapter, driver: ready.driver, dxr: ready.dxr }
      plan = stressPlan({ minutes: opts.minutes, load: opts.load, dxr: ready.dxr, loopMs })
      const seed = crypto.randomInt(2 ** 32)
      const reference = {}
      for (const test of plan.tests) {
        this.onEvent?.({ type: 'stress', phase: 'warm', test, loop: 0, total: plan.loops.length })
        await engine.ask({ cmd: 'segment', test, seed, index: -1, ms: warmMs })
        reference[test] = await engine.ask({ cmd: 'fingerprint', test, seed, frame: CHECK_FRAME })
      }
      for (let i = 0; i < plan.loops.length; i++) {
        const test = plan.loops[i]
        const from = samples.length
        const seg = await engine.ask({ cmd: 'segment', test, seed, index: i, ms: loopMs })
        const check = await engine.ask({ cmd: 'fingerprint', test, seed, frame: CHECK_FRAME })
        const window = sensorSummary(samples.slice(from))
        const fps = frameStats(decodeFrameUs(seg.frameUs))
        const loop = {
          index: i, test, fps: fps.fps, low1: fps.low1, clock: window.gpuClockAvg, tempMax: window.gpuTempMax, power: window.gpuPowerAvg,
          error: check.ids !== reference[test].ids ? 'ids' : check.image !== reference[test].image ? 'image' : null
        }
        loops.push(loop)
        this.onEvent?.({ type: 'stress', phase: 'run', test, loop: i + 1, total: plan.loops.length, data: loop })
      }
    } catch (e) {
      if (!this.stopReason) this.stopReason = e.message === 'cancelled' ? (engine.child.exitCode ? 'engine_crashed' : 'cancelled') : isDeviceLost(e.message) ? 'device_lost' : null
      if (!this.stopReason) return { ok: false, error: e.message }
    } finally {
      clearInterval(sampler)
      this.hardware?.releaseSensors?.('gpustress')
      engine.stop()
      this.engine = null
      this.rect = null
    }
    if (!gpu) return { ok: false, error: this.stopReason === 'cancelled' ? 'cancelled' : 'engine_failed' }
    if (!loops.length && this.stopReason === 'cancelled') return { ok: false, error: 'cancelled' } // nothing measured: nothing to keep
    const summary = summarizeStress({ loops, stop: this.stopReason, planned: plan?.loops.length ?? 0, tempLimit: opts.tempLimit })
    const entry = { id: `s${Date.now()}`, at: Date.now(), minutes: opts.minutes, load: opts.load, gpu, summary, loops }
    fs.writeFileSync(this.stressFile, JSON.stringify([entry, ...this.stressHistory()].slice(0, 20), null, 1))
    return { ok: true, run: entry }
  }

  async _preview(engine) {
    if (!this.toJpeg) return null
    const file = path.join(os.tmpdir(), `darkhub-gpubench-${process.pid}.rgba`)
    try {
      const shot = await engine.ask({ cmd: 'shot', path: file })
      if (!shot.ok) return null
      return await this.toJpeg(fs.readFileSync(file), shot.width, shot.height)
    } catch { return null } finally { fs.rmSync(file, { force: true }) }
  }

  /** Segment, commit, open what the server picked, repeat. The next seed only arrives after the commitment. */
  async _rankedRun(engine, ready, warm, record, samples) {
    await warm() // before the challenge exists: the server clock must not include it
    const exeHash = crypto.createHash('sha256').update(fs.readFileSync(this.exe)).digest('hex')
    const plan = await this._api('POST', '/runs', {
      sceneVersion: SCENE_VERSION,
      engine: { version: this.app.getVersion(), sha256: exeHash },
      system: { gpu: ready.adapter, vendorId: ready.vendorId, deviceId: ready.deviceId, vramMb: ready.vramMb, driver: ready.driver, dxr: ready.dxr, cpu: os.cpus()[0]?.model?.trim() ?? null, ramGb: Math.round(os.totalmem() / 1073741824), os: os.release() }
    })
    const perTest = Number(plan.segments) || 6
    const total = plan.tests.length * perTest
    let seed = plan.segmentSeed
    let done = 0
    const pending = []
    for (const test of plan.tests) {
      for (let index = 0; index < perTest; index++) {
        this.onEvent?.({ type: 'progress', phase: 'run', test, index: ++done, total })
        const seg = await engine.ask({ cmd: 'segment', test, seed, index, ms: plan.segmentMs })
        record(seg)
        const answer = await this._api('POST', `/runs/${plan.runId}/segments`, { test, index, frames: seg.frames, segmentRoot: seg.root, frameUs: seg.frameUs, clock: seg.clock })
        // the clock of the next segment starts with this answer: nothing but rendering may happen before it
        pending.push({ test, index, seed, open: answer.open || [] })
        seed = answer.nextSeed
      }
    }
    for (const p of pending) {
      this.onEvent?.({ type: 'progress', phase: 'proof', test: p.test, index: p.index + 1, total })
      const openings = []
      for (const o of p.open) {
        const r = await engine.ask({ cmd: 'open', test: p.test, seed: p.seed, frame: o.frame, tiles: o.tiles })
        openings.push({ frame: r.frame, tiles: r.tiles, tileHashes: r.tileHashes, path: r.path })
      }
      await this._api('POST', `/runs/${plan.runId}/openings`, { test: p.test, index: p.index, openings })
    }
    this.onEvent?.({ type: 'progress', phase: 'finish', test: '', index: total, total })
    const preview = await this._preview(engine)
    const modules = await engine.ask({ cmd: 'modules' }).then((m) => m.modules).catch(() => [])
    // what the driver's control panel imposes on this process: reported, and tagged on the result by the server
    const driver = await engine.ask({ cmd: 'driver' }).catch(() => null)
    const environment = { os: os.release(), appVersion: this.app.getVersion(), modules, driver }
    const result = await this._api('POST', `/runs/${plan.runId}/finish`, { sensors: sensorSummary(samples), trace: samples.slice(-240), preview, environment })
    return { runId: plan.runId, status: result.status, score: result.score, flags: result.flags || [], driver }
  }
}
