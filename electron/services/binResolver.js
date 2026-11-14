import fsRaw from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export function platformBinaryName(base, platform = process.platform) {
  return platform === 'win32' ? `${base}.exe` : base
}

export function fileExists(p) {
  return typeof p === 'string' && p.length > 0 && fsRaw.existsSync(p)
}

export function runCommand(cmd, args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    }
    const timer = timeoutMs > 0 ? setTimeout(() => { try { child.kill() } catch {} finish(124) }, timeoutMs) : null
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    child.on('error', () => finish(127))
    child.on('close', (code) => finish(code))
  })
}

export async function findOnPath(name, platform = process.platform) {
  const finder = platform === 'win32' ? 'where.exe' : 'which'
  const { code, stdout } = await runCommand(finder, [name], { timeoutMs: 5000 })
  if (code !== 0) return null
  const first = String(stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean)
  return first && fileExists(first) ? first : null
}

export async function resolveBinary({ name, explicitPath, candidates = [], allowPath = true, platform = process.platform } = {}) {
  if (fileExists(explicitPath)) return explicitPath
  for (const c of candidates) {
    if (fileExists(c)) return c
  }
  if (allowPath && name) {
    const found = await findOnPath(name, platform)
    if (found) return found
  }
  return null
}
