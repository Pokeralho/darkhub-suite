// Child-process helpers shared by the converters: argument arrays only (never a shell string), whole-tree kill on
// cancel, optional below-normal priority so long encodes do not make the PC sluggish.
import { spawn } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'

export function killTree(child) {
  if (!child || child.exitCode !== null) return
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
    }
  } catch {}
  try { child.kill() } catch {}
}

/**
 * Runs a binary. Resolves { code, stdout (Buffer), stderr (string), cancelled }.
 * opts: { cwd, input (Buffer for stdin), timeoutMs, lowPriority, job (object with .cancelled / .children Set),
 *         onStdout(text), maxStdout (bytes kept), env }
 */
export function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    if (opts.job?.cancelled) { resolve({ code: null, stdout: Buffer.alloc(0), stderr: '', cancelled: true }); return }
    const child = spawn(command, args, {
      cwd: opts.cwd, windowsHide: true, env: opts.env || process.env,
      stdio: [opts.input ? 'pipe' : 'ignore', 'pipe', 'pipe']
    })
    if (opts.lowPriority && child.pid) {
      try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch {}
    }
    opts.job?.children?.add(child)
    const out = []
    let outLen = 0
    const maxOut = opts.maxStdout ?? 512 * 1024 * 1024
    let err = ''
    let timer = null
    child.stdout.on('data', (b) => {
      if (opts.onStdout) { try { opts.onStdout(b.toString('utf8')) } catch {} }
      if (outLen < maxOut) { out.push(b); outLen += b.length }
    })
    child.stderr.on('data', (b) => { if (err.length < 256 * 1024) err += b.toString('utf8') })
    if (opts.input) {
      child.stdin.on('error', () => {})
      child.stdin.end(opts.input)
    }
    if (opts.timeoutMs > 0) timer = setTimeout(() => { err += '\n[timeout]'; killTree(child) }, opts.timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); opts.job?.children?.delete(child); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      opts.job?.children?.delete(child)
      resolve({ code, stdout: Buffer.concat(out), stderr: err, cancelled: Boolean(opts.job?.cancelled) })
    })
  })
}

/** "name.ext", or "name (2).ext"... when that already exists or would overwrite one of `avoid` (the inputs). */
export function uniqueOutputPath(dir, base, ext, avoid = []) {
  const taken = new Set(avoid.map((p) => path.resolve(p).toLowerCase()))
  for (let i = 1; i < 10000; i++) {
    const name = i === 1 ? `${base}.${ext}` : `${base} (${i}).${ext}`
    const full = path.join(dir, name)
    if (!taken.has(path.resolve(full).toLowerCase()) && !fs.existsSync(full)) return full
  }
  return path.join(dir, `${base}-${Date.now()}.${ext}`)
}

/** Runs `fn(item, index)` over items with at most `limit` in flight; keeps result order. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

/** Creates a job handle the IPC layer can cancel. */
export function createJob(id) {
  return { id, cancelled: false, children: new Set(), cancel() { this.cancelled = true; for (const c of this.children) killTree(c) } }
}

export function extOf(file) {
  return path.extname(String(file || '')).slice(1).toLowerCase()
}
