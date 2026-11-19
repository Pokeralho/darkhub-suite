// Runs a snippet from the Text Editor with a toolchain already on the PC (JavaScript and PowerShell are always
// available). The code runs as the user, like in a terminal: a temp folder per run, argument arrays (no shell),
// stdin from the screen, a time limit that kills the whole process tree, and capped output.
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const isWin = process.platform === 'win32'
const OUTPUT_CAP = 512 * 1024
const DETECT_TTL_MS = 60 * 1000

/** id → how to find and run it. `compile` builds `out` first; `run` gives [exe, args]. */
export const RUNTIMES = {
  javascript: { label: 'JavaScript (Node)', ext: 'js', builtin: true, run: (_exe, f) => [process.execPath, [f]], env: { ELECTRON_RUN_AS_NODE: '1' } },
  python: { label: 'Python', ext: 'py', candidates: isWin ? ['python', 'py', 'python3'] : ['python3', 'python'], run: (exe, f) => [exe, isWin && /\bpy(\.exe)?$/i.test(exe) ? ['-3', '-u', f] : ['-u', f]], env: { PYTHONIOENCODING: 'utf-8' } },
  powershell: { label: 'PowerShell', ext: 'ps1', candidates: isWin ? ['pwsh', 'powershell'] : ['pwsh', 'powershell'], run: (exe, f) => [exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); & '${f.replace(/'/g, "''")}'; exit $LASTEXITCODE`]] },
  c: { label: 'C', ext: 'c', candidates: ['gcc', 'clang', ...(isWin ? [] : ['cc'])], compile: (exe, f, out) => [exe, [f, '-O1', '-o', out]], run: (_exe, _f, out) => [out, []] },
  cpp: { label: 'C++', ext: 'cpp', candidates: ['g++', 'clang++', ...(isWin ? [] : ['c++'])], compile: (exe, f, out) => [exe, [f, '-O1', '-std=c++20', '-o', out]], run: (_exe, _f, out) => [out, []] },
  csharp: { label: 'C# (.NET 10+)', ext: 'cs', candidates: ['dotnet'], run: (exe, f) => [exe, ['run', f]], env: { DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } },
  java: { label: 'Java', ext: 'java', candidates: ['java'], run: (exe, f) => [exe, [f]] },
  go: { label: 'Go', ext: 'go', candidates: ['go'], run: (exe, f) => [exe, ['run', f]] },
  rust: { label: 'Rust', ext: 'rs', candidates: ['rustc'], compile: (exe, f, out) => [exe, [f, '-O', '-o', out]], run: (_exe, _f, out) => [out, []] },
  batch: { label: 'Batch (cmd)', ext: 'bat', builtin: true, platforms: ['win32'], run: (_exe, f) => [process.env.ComSpec || 'cmd.exe', ['/d', '/c', f]] }
}

const which = (name) => new Promise((resolve) => {
  if (isWin) {
    execFile('where.exe', [name], { windowsHide: true, timeout: 4000 }, (err, stdout) => {
      // skip the Microsoft Store "python.exe" alias: it opens the Store instead of running code
      const hit = err ? '' : String(stdout).split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/\\WindowsApps\\/i.test(l))
      resolve(hit || null)
    })
  } else {
    execFile('which', [name], { timeout: 4000 }, (err, stdout) => {
      const hit = err ? '' : String(stdout).split(/\r?\n/).map((l) => l.trim()).find(Boolean)
      resolve(hit || null)
    })
  }
})

let detected = { at: 0, map: null }
/** { id: { label, available, path } } for every runtime, cached for a minute. */
export async function detectRuntimes(force = false) {
  if (!force && detected.map && Date.now() - detected.at < DETECT_TTL_MS) return detected.map
  const map = {}
  await Promise.all(Object.entries(RUNTIMES).map(async ([id, r]) => {
    if (r.platforms && !r.platforms.includes(process.platform)) {
      map[id] = { label: r.label, available: false, path: null }
      return
    }
    let exe = r.builtin ? (id === 'javascript' ? process.execPath : (id === 'batch' ? (process.env.ComSpec || 'cmd.exe') : null)) : null
    if (exe && !isWin && id === 'batch') exe = null
    for (const c of r.candidates || []) { if (exe) break; exe = await which(c) }
    map[id] = { label: r.label, available: Boolean(exe), path: exe }
  }))
  detected = { at: Date.now(), map }
  return map
}

function killTree(child) {
  if (!child?.pid) return
  if (isWin) {
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {})
  } else {
    try { process.kill(-child.pid, 'SIGKILL') } catch {
      try { child.kill('SIGKILL') } catch {}
    }
  }
}

let current = null
export function cancelRun() { if (current) { current.cancelled = true; killTree(current.child) } return { ok: true } }

function exec(cmd, args, { cwd, env, input, timeoutMs }) {
  return new Promise((resolve) => {
    const started = Date.now()
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, detached: !isWin })
    current = { child, cancelled: false }
    const run = current
    child.stdout.setEncoding?.('utf8') // stream decoding: no U+FFFD when a multibyte char is split across chunks
    child.stderr.setEncoding?.('utf8')
    const take = (buf, chunk) => (buf.length < OUTPUT_CAP ? buf + chunk.toString('utf8') : buf)
    child.stdout.on('data', (c) => { stdout = take(stdout, c) })
    child.stderr.on('data', (c) => { stderr = take(stderr, c) })
    child.stdin.on('error', () => {})
    child.stdin.end(input ? String(input) : '')
    const timer = setTimeout(() => { timedOut = true; killTree(child) }, timeoutMs)
    const done = (code, error) => {
      clearTimeout(timer)
      if (current === run) current = null
      resolve({
        code,
        stdout: stdout.length >= OUTPUT_CAP ? stdout.slice(0, OUTPUT_CAP) + '\n[...]' : stdout,
        stderr: error ? `${stderr}${error}` : stderr,
        ms: Date.now() - started,
        timedOut,
        cancelled: run.cancelled
      })
    }
    child.on('error', (e) => done(-1, e.message))
    child.on('close', (code) => done(code ?? -1))
  })
}

/**
 * @param {{ language: string, code: string, input?: string, timeoutSec?: number }} p
 */
export async function runCode({ language, code, input = '', timeoutSec = 10 }) {
  const rt = RUNTIMES[language]
  if (!rt) return { ok: false, error: 'Linguagem não suportada' }
  if (typeof code !== 'string' || !code.trim()) return { ok: false, error: 'Nada para executar' }
  if (code.length > 1024 * 1024) return { ok: false, error: 'Código grande demais (máx. 1 MB)' }
  if (current) return { ok: false, error: 'Já existe um programa rodando' }
  const info = (await detectRuntimes())[language]
  if (!info?.available) return { ok: false, error: 'runtime-missing', runtime: language }

  const timeoutMs = Math.max(1, Math.min(120, Number(timeoutSec) || 10)) * 1000
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'darkhub-code-'))
  // Java's single-file launcher wants the file named after the public class; Main is the convention in the examples
  const file = path.join(dir, language === 'java' ? 'Main.java' : `main.${rt.ext}`)
  const out = path.join(dir, isWin ? 'main.exe' : 'main')
  try {
    // PowerShell 5.1 reads BOM-less scripts as ANSI: write a BOM so accents survive
    // batch: switch the console to UTF-8 first so accents print correctly
    const prefix = language === 'powershell' ? '\ufeff' : (isWin && language === 'batch') ? '@chcp 65001 >nul\r\n' : ''
    // cmd misreads LF-only batch files (lines get split mid-word): normalize to CRLF
    const body = isWin && language === 'batch' ? code.replace(/\r?\n/g, '\r\n') : code
    await fs.writeFile(file, prefix + body, 'utf8')
    const opts = { cwd: dir, env: rt.env || {}, input, timeoutMs }
    if (rt.compile) {
      const [cmd, args] = rt.compile(info.path, file, out)
      const c = await exec(cmd, args, { ...opts, input: '' })
      if (c.code !== 0 || c.cancelled || c.timedOut) return { ok: true, phase: 'compile', ...c }
    }
    const [cmd, args] = rt.run(info.path, file, out)
    return { ok: true, phase: 'run', ...(await exec(cmd, args, opts)) }
  } finally {
    // the process may still hold the exe for a moment after taskkill
    setTimeout(() => { fs.rm(dir, { recursive: true, force: true }).catch(() => {}) }, 1500).unref?.()
  }
}
