#!/usr/bin/env node
// DarkHub dev runner: Vite (renderer, hot reload) + Electron (restarted automatically when electron/** changes).
//
//   npm run dev                      -> opens on Home
//   npm run dev -- --page=optimizer  -> opens straight on a screen (route id, see docs/PROJECT_MAP.md)
//   npm run dev -- --no-watch        -> do not restart Electron on main-process changes
//
// After an automatic restart the app reopens on the screen you were on.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argPage = (args.find((a) => a.startsWith('--page=')) || '').slice(7)
const watch = !args.includes('--no-watch')
const stateFile = path.join(os.tmpdir(), 'darkhub-dev-last-page.txt')

const c = { dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', reset: '\x1b[0m' }
const say = (msg, color = c.cyan) => console.log(`${color}[dev]${c.reset} ${msg}`)

try { fs.writeFileSync(stateFile, argPage || '') } catch {}

function killTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

// A dev Electron orphaned by an earlier restart keeps the single-instance lock, so every new launch quits as a
// "second instance". Before each start (and on exit) close leftovers of THIS repo only: its electron.exe and the
// native daemons under electron/services.
function killStaleDev() {
  if (process.platform !== 'win32') return
  const esc = (s) => s.replace(/'/g, "''")
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -like '${esc(path.join(root, 'node_modules', 'electron', 'dist'))}*' -or $_.ExecutablePath -like '${esc(path.join(root, 'electron', 'services'))}*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore' })
}

function waitForVite(url, timeoutMs = 60000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http.get(url, (res) => { res.resume(); resolve() }).on('error', () => {
        if (Date.now() - started > timeoutMs) reject(new Error('Vite did not start in 60s'))
        else setTimeout(tryOnce, 300)
      })
    }
    tryOnce()
  })
}

// ---------------------------------------------------------------- Vite
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env
})
const prefix = (tag, color) => (chunk) => {
  for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) console.log(`${color}[${tag}]${c.reset} ${line}`)
}
vite.stdout.on('data', prefix('vite', c.dim))
vite.stderr.on('data', prefix('vite', c.yellow))
vite.on('exit', (code) => { say(`Vite saiu (código ${code}). Encerrando.`, c.red); shutdown(1) })

// ---------------------------------------------------------------- Electron
let electron = null
let electronReady = false // no restarts before the first launch
let restarting = false
let quitting = false

function startElectron() {
  let page = ''
  try { page = fs.readFileSync(stateFile, 'utf8').trim() } catch {}
  killStaleDev()
  say(`Iniciando Electron${page ? ` na tela "${page}"` : ''}…`, c.green)
  electron = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, DARKHUB_PAGE: page, DARKHUB_DEV_STATE: stateFile }
  })
  electron.on('exit', (code) => {
    if (restarting || quitting) return
    say(`Janela do Electron fechada (código ${code}). Ctrl+C encerra o Vite; ou salve um arquivo em electron/ para reabrir.`, c.yellow)
    electron = null
  })
}

function restartElectron(reason) {
  if (quitting || !electronReady) return
  restarting = true
  say(`Alteração em ${reason}: reiniciando o processo principal…`, c.yellow)
  killTree(electron)
  setTimeout(() => { restarting = false; startElectron() }, 400)
}

// ---------------------------------------------------------------- watcher (main process only; renderer uses Vite HMR)
if (watch) {
  let timer = null
  let lastFile = ''
  const ignore = /\.(exe|dll|pdb|lib|exp|log|tmp|json)$|[\\/](node_modules|assets)[\\/]/i
  const startedAt = Date.now()
  const seen = new Map() // file -> last mtimeMs; antivirus/indexer reads fire fs.watch without changing the file
  fs.watch(path.join(root, 'electron'), { recursive: true }, (_event, file) => {
    if (!file || ignore.test(file)) return
    let mtime = 0
    try { mtime = fs.statSync(path.join(root, 'electron', String(file))).mtimeMs } catch { return }
    const prev = seen.get(String(file)) ?? startedAt
    if (mtime <= prev) return
    seen.set(String(file), mtime)
    lastFile = `electron/${String(file).replace(/\\/g, '/')}`
    clearTimeout(timer)
    timer = setTimeout(() => restartElectron(lastFile), 350)
  })
}

function shutdown(code = 0) {
  if (quitting) return
  quitting = true
  killTree(electron)
  killTree(vite)
  killStaleDev()
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

waitForVite('http://localhost:5173/')
  .then(() => {
    say('Vite pronto em http://localhost:5173 (a tela recarrega sozinha ao salvar arquivos em src/).')
    if (watch) say('Observando electron/**: o processo principal reinicia sozinho ao salvar.')
    startElectron()
    electronReady = true
  })
  .catch((err) => { say(err.message, c.red); shutdown(1) })
