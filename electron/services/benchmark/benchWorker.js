// Benchmark workloads, run in a separate Node process (Electron as Node) so the app stays responsive.
// argv[2] = JSON { runs, quick, diskDir }. Emits JSON lines: { type: 'progress', test, run, runs } and
// { type: 'result', samples: { metric: number[] } }.
import { Worker } from 'node:worker_threads'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

const opts = JSON.parse(process.argv[2] || '{}')
const runs = Math.max(1, Math.min(10, Number(opts.runs) || 5))
const quick = Boolean(opts.quick)
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const now = () => Number(process.hrtime.bigint()) / 1e6 // ms

// Fixed integer + float work; returns ops (iterations x 4) so scores are Mops/s.
const CPU_KERNEL = `
function kernel(iters) {
  let x = 0x9e3779b9 | 0, f = 1.0001, acc = 0
  for (let i = 0; i < iters; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5
    f = f * 1.0000001 + (x & 1023) * 1e-9
    acc = (acc + (x >>> 0) % 977) | 0
  }
  return acc + f
}`
const CPU_ITERS = quick ? 20e6 : 60e6

function cpuSingle() {
  const kernel = new Function(`${CPU_KERNEL}; return kernel`)()
  const t = now()
  kernel(CPU_ITERS)
  return (CPU_ITERS * 4) / ((now() - t) / 1000) / 1e6
}

function cpuMulti() {
  const n = os.cpus().length
  const code = `const { parentPort, workerData } = require('node:worker_threads'); ${CPU_KERNEL}; parentPort.postMessage(kernel(workerData))`
  const per = Math.round(CPU_ITERS / 2)
  return new Promise((resolve, reject) => {
    const t = now()
    let left = n
    for (let i = 0; i < n; i++) {
      const w = new Worker(code, { eval: true, workerData: per })
      w.once('message', () => { w.terminate(); if (--left === 0) resolve((per * 4 * n) / ((now() - t) / 1000) / 1e6) })
      w.once('error', reject)
    }
  })
}

const MEM_BYTES = (quick ? 128 : 256) * 1024 * 1024
let memA = null
let memB = null
function memBandwidth() {
  memA ||= new Float64Array(MEM_BYTES / 8).fill(1)
  memB ||= new Float64Array(MEM_BYTES / 8)
  const t = now()
  for (let r = 0; r < 4; r++) memB.set(memA)
  return (MEM_BYTES * 2 * 4) / ((now() - t) / 1000) / 1e9 // read + write
}

// Random cyclic permutation over a buffer far larger than the CPU caches: each step is a dependent cache miss.
let chain = null
function memLatency() {
  const n = (quick ? 32 : 64) * 1024 * 1024 / 4
  if (!chain) {
    chain = new Uint32Array(n)
    const order = new Uint32Array(n)
    for (let i = 0; i < n; i++) order[i] = i
    for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = order[i]; order[i] = order[j]; order[j] = t }
    for (let i = 0; i < n; i++) chain[order[i]] = order[(i + 1) % n]
  }
  const steps = 4_000_000
  let p = 0
  const t = now()
  for (let i = 0; i < steps; i++) p = chain[p]
  const ns = ((now() - t) * 1e6) / steps
  return p >= 0 ? ns : ns
}

// 1 ms ticks for one second, measuring how late each tick wakes up (what games feel as frame-pacing jitter).
function timerJitter() {
  return new Promise((resolve) => {
    const lates = []
    let expected = now() + 1
    const tick = () => {
      const late = (now() - expected) * 1000 // µs
      lates.push(Math.max(0, late))
      if (lates.length >= (quick ? 300 : 1000)) {
        const s = [...lates].sort((a, b) => a - b)
        resolve({ p99: s[Math.ceil(0.99 * s.length) - 1], avg: lates.reduce((a, b) => a + b, 0) / lates.length })
        return
      }
      expected = now() + 1
      setTimeout(tick, 1)
    }
    setTimeout(tick, 1)
  })
}

// Disk: sequential write with a final flush (real write throughput), and 4K writes each flushed to the device.
function diskSeqWrite(file) {
  const total = (quick ? 256 : 1024) * 1024 * 1024
  const buf = Buffer.alloc(4 * 1024 * 1024, 7)
  const fd = fs.openSync(file, 'w')
  const t = now()
  try {
    for (let w = 0; w < total; w += buf.length) fs.writeSync(fd, buf)
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
  return total / ((now() - t) / 1000) / 1e6
}

function disk4kSyncWrite(file) {
  const span = 64 * 1024 * 1024
  const buf = Buffer.alloc(4096, 3)
  const fd = fs.openSync(file, 'w+')
  try {
    fs.ftruncateSync(fd, span)
    let ops = 0
    const t = now()
    const limit = quick ? 1000 : 2000 // ms
    while (now() - t < limit) {
      fs.writeSync(fd, buf, 0, 4096, ((Math.random() * (span / 4096)) | 0) * 4096)
      fs.fdatasyncSync(fd)
      ops++
    }
    return ops / ((now() - t) / 1000)
  } finally { fs.closeSync(fd) }
}

const samples = { cpuSingle: [], cpuMulti: [], memBandwidth: [], memLatency: [], timerJitterP99: [], timerJitterAvg: [], diskSeqWrite: [], disk4kSyncWrite: [] }
const dir = opts.diskDir && fs.existsSync(opts.diskDir) ? opts.diskDir : os.tmpdir()
const file = path.join(dir, `darkhub-bench-${process.pid}.tmp`)

const tests = [
  ['cpuSingle', async () => samples.cpuSingle.push(cpuSingle())],
  ['cpuMulti', async () => samples.cpuMulti.push(await cpuMulti())],
  ['memBandwidth', async () => samples.memBandwidth.push(memBandwidth())],
  ['memLatency', async () => samples.memLatency.push(memLatency())],
  ['timerJitter', async () => { const j = await timerJitter(); samples.timerJitterP99.push(j.p99); samples.timerJitterAvg.push(j.avg) }],
  ['diskSeqWrite', async () => samples.diskSeqWrite.push(diskSeqWrite(file))],
  ['disk4kSyncWrite', async () => samples.disk4kSyncWrite.push(disk4kSyncWrite(file))]
]

try {
  // warm-up: JIT and CPU clocks settle before anything is measured
  cpuSingle()
  memBandwidth() // also allocates the buffers, so the first measured pass is not an allocation
  for (const [name, fn] of tests) {
    if (opts.skipDisk && name.startsWith('disk')) continue
    for (let r = 0; r < runs; r++) {
      emit({ type: 'progress', test: name, run: r + 1, runs })
      await fn()
    }
  }
  emit({ type: 'result', samples })
} catch (e) {
  emit({ type: 'error', error: String(e?.message ?? e) })
} finally {
  try { fs.rmSync(file, { force: true }) } catch { /* in use */ }
}
process.exit(0)
