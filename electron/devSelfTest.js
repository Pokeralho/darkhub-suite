// Dev-only self-test: `npm run selftest` (needs the Vite dev server).
// 1. Calls every READ-ONLY IPC handler against this machine (nothing that changes the system) and records
//    ok / error / time / a preview of the result.
// 2. Opens every screen with the real backend, captures a screenshot and the renderer console errors.
// Output: scratch/selftest/report.md, report.json, <route>.png
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { devHistory } from './devBootstrap.js'

// A channel is exercised only if its action starts with a read verb AND contains no mutating/heavy word.
const READ = /^(get|list|check|detect|is|read|status|info|query|fetch|analy[sz]e|dnsInfo|adapterInfo|policies|about|has|can|find|peek|preview)/i
const UNSAFE = /apply|set|run|install|delete|remove|kill|clean|flush|reset|renew|create|enable|disable|toggle|start|stop|restore|revert|undo|save|write|inject|open|launch|download|update|export|import|uninstall|boost|optimi[sz]e|repair|lock|add|pause|resume|cancel|clear|change|close|minimi[sz]e|maximi[sz]e|show|hide|elevat|purge|send|report|track|block|quarantine|terminate|mark|upsert|rename|move|copy|convert|compress|extract|benchmark|tracert|scan|speed|ping|discover|refresh|generate|encrypt|decrypt|summar|ocr/i
const TIMEOUT_MS = 30000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.env.DARKHUB_SELFTEST_OUT || path.join(root, 'scratch', 'selftest')

const short = (v) => {
  try {
    const s = JSON.stringify(v)
    return s === undefined ? 'undefined' : s.length > 220 ? `${s.slice(0, 220)}…` : s
  } catch { return String(v) }
}
const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS))])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function mainWindow() {
  for (let i = 0; i < 60; i++) {
    const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && /localhost:5173|index\.html/.test(x.webContents.getURL()))
    if (w) return w
    await sleep(500)
  }
  throw new Error('main window did not open')
}

export async function run(listeners) {
  fs.mkdirSync(outDir, { recursive: true })
  const win = await mainWindow()
  win.setSize(1366, 820)
  await sleep(6000) // let startup background work settle

  // ---------------------------------------------------------------- 1. read-only IPC
  const ipc = []
  const channels = (process.env.SELFTEST_SCREENS_ONLY || process.env.SELFTEST_SCENARIOS_ONLY) ? [] : [...listeners.keys()].filter((ch) => {
    const action = ch.split(':').slice(1).join(':')
    return READ.test(action) && !UNSAFE.test(action) && !ch.startsWith('dev:')
  }).sort()
  for (const ch of channels) {
    const t0 = performance.now()
    let entry
    try {
      const result = await withTimeout(Promise.resolve(listeners.get(ch)({ sender: win.webContents, senderFrame: win.webContents.mainFrame })))
      const failed = result && typeof result === 'object' && result.ok === false
      entry = { channel: ch, ok: !failed, error: failed ? String(result.error ?? result.message ?? 'ok:false') : undefined, result: short(result) }
    } catch (err) {
      entry = { channel: ch, ok: false, threw: true, error: err?.message ?? String(err) }
    }
    entry.ms = Math.round(performance.now() - t0)
    ipc.push(entry)
    console.log(`[selftest] ${entry.ok ? 'OK ' : 'ERR'} ${ch.padEnd(40)} ${String(entry.ms).padStart(6)} ms${entry.ok ? '' : `  -> ${entry.error}`}`)
  }

  // ---------------------------------------------------------------- 1b. functional scenarios with harmless inputs
  // Each tool runs on files the test creates itself (or read-only targets) and the result is checked.
  const call = async (ch, ...args) => withTimeout(Promise.resolve(listeners.get(ch)?.({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, ...args)))
  const tmp = path.join(outDir, `tmp-${Date.now()}`)
  for (const d of fs.readdirSync(outDir)) if (d.startsWith('tmp')) { try { fs.rmSync(path.join(outDir, d), { recursive: true, force: true }) } catch {} }
  fs.mkdirSync(path.join(tmp, 'out'), { recursive: true })
  const txt = path.join(tmp, 'sample.txt')
  fs.writeFileSync(txt, 'DarkHub selftest\nlinha 2\n')
  const png = path.join(tmp, 'sample.png')
  try {
    const sharp = (await import('sharp')).default
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="100%" height="100%" fill="white"/><text x="30" y="105" font-family="Arial" font-size="72" fill="black">DarkHub 2026</text></svg>'
    await sharp(Buffer.from(svg)).png().toFile(png)
  } catch (e) { console.log('[selftest] could not build sample.png', e?.message) }
  await call('dialog:grantDroppedFiles', [txt, png]).catch(() => {})
  const steam = await call('dlss5:getSteamGames').catch(() => [])
  const scenarios = [
    ['fs:readFile', [txt], (r) => (String(r?.content ?? r).includes('DarkHub selftest') ? null : 'content mismatch')],
    ['ocr:extractText', [{ imagePath: png, lang: 'eng' }], (r) => (/darkhub/i.test(JSON.stringify(r)) ? null : 'text not recognised')],
    ['metadata:read', [png], (r) => (r && !r.error ? null : 'no metadata')],
    // Output beside the picked file (the converter's default) must work without a folder dialog.
    ['files:convertImages', [{ inputFiles: [png], outputDir: tmp, outputFormat: 'webp', quality: 80 }],
      () => (fs.readdirSync(tmp).some((f) => f.endsWith('.webp')) ? null : 'no .webp written')],
    ['security:scanUrl', [{ url: 'http://paypa1-secure-login.example.com/verify' }], (r) => (r ? null : 'empty')],
    ['network:ping', ['1.1.1.1'], (r) => (r && r.ok !== false ? null : 'ping failed')],
    ['network:portScan', [{ host: '127.0.0.1', ports: [5173, 9] }], (r) => (/5173/.test(JSON.stringify(r)) ? null : 'dev port 5173 not reported')],
    ['youtube:getVideoInfo', [{ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }], (r) => (r?.title ? null : 'no title')],
    ['library:discover', [], (r) => (Array.isArray(r?.discovered) ? (console.log('[selftest]   discovered:', r.discovered.map((g) => `${g.name} -> ${path.basename(g.exePath)}`).join(' | ')), null) : 'no discovered list')],
    ['optiscaler:analyze', [{ exePath: 'C:\\Windows\\notepad.exe' }], (r) => (r && r.ok !== false ? null : 'analysis failed')],
    ...(Array.isArray(steam) && steam[0] ? [['dlss5:scanGame', [{ path: steam[0].installDir }], (r) => (r && r.ok !== false ? null : 'scan failed')]] : []),
    ['security:scanProcesses', [], (r) => (r ? null : 'empty')],
    // Disk map: a real (read-only) scan of the system drive; the scan stays loaded so the screen pass shows the map.
    ['diskscan:start', [{ root: process.env.SELFTEST_DISKSCAN_ROOT || `${process.env.SystemDrive || 'C:'}\\` }], async (r) => {
      const t0 = Date.now()
      let st
      do { await sleep(500); st = await call('diskscan:status') } while (st?.running && Date.now() - t0 < 25000)
      const v = await call('diskscan:view', { id: 'd0', minFraction: 0.0001 })
      return v?.tree?.size > 0 ? (console.log(`[selftest]   diskmap: ${st?.done?.files} files in ${st?.done?.ms} ms`), null) : `no tree (${v?.error || st?.error})`
    }]
  ]
  for (const [ch, args, check] of scenarios) {
    if (!listeners.has(ch)) { ipc.push({ channel: `${ch} (cenário)`, ok: false, error: 'handler not registered', ms: 0 }); continue }
    const t0 = performance.now()
    let entry
    try {
      const r = await call(ch, ...args)
      const failed = r && typeof r === 'object' && r.ok === false
      const why = failed ? String(r.error ?? 'ok:false') : await check(r)
      entry = { channel: `${ch} (cenário)`, ok: !why, error: why || undefined, result: short(r) }
    } catch (err) {
      entry = { channel: `${ch} (cenário)`, ok: false, threw: true, error: err?.message ?? String(err) }
    }
    entry.ms = Math.round(performance.now() - t0)
    ipc.push(entry)
    console.log(`[selftest] ${entry.ok ? 'OK ' : 'ERR'} ${entry.channel.padEnd(40)} ${String(entry.ms).padStart(6)} ms${entry.ok ? '' : `  -> ${entry.error}`}`)
  }

  // ---------------------------------------------------------------- 1c. system-changing tests (disposable VM only)
  if (process.env.DARKHUB_SELFTEST_MUTATE === '1') {
    const { runMutations } = await import('./devSelfTestMutate.js')
    // System-changing calls have their own (long) timeouts in the product: DISM cleanup can take 30 min.
    const callLong = (ch, ...args) => Promise.resolve(listeners.get(ch)?.({ sender: win.webContents, senderFrame: win.webContents.mainFrame }, ...args))
    ipc.push(...await runMutations(callLong, (m) => console.log(`[selftest] ${m}`)))
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), ipc, partial: true }, null, 1))
  }

  // ---------------------------------------------------------------- 2. every screen with the real backend
  // Without docs/map (e.g. a copied app folder) fall back to the known routes.
  let routes = process.env.SELFTEST_SCENARIOS_ONLY ? [] : ['home', 'dashboard', 'darkos', 'optimizer', 'ultra-latency', 'darkpacer', 'optiscaler', 'dlss5', 'dll-injector', 'monitor', 'driver', 'networktools', 'setuphub', 'library', 'security', 'passwords', 'decryption', 'converter', 'downloads', 'youtube', 'ocr', 'metadata', 'texteditor', 'summarizer', 'autoclicker', 'devtools', 'powershell', 'luluflix', 'juuzou', 'settings']
  try {
    const map = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'map', 'map.json'), 'utf8'))
    if (!process.env.SELFTEST_SCENARIOS_ONLY) routes = [...new Set(['home', ...map.features.map((f) => f.id), 'settings'])]
  } catch {}
  if (process.env.SELFTEST_ROUTES) routes = process.env.SELFTEST_ROUTES.split(',').map((r) => r.trim()).filter(Boolean)
  let consoleBuf = []
  win.webContents.on('console-message', (e) => {
    const level = e?.level ?? 'info'
    if (level === 'error' || level === 3 || level === 'warning' || level === 2) consoleBuf.push(`[${level}] ${e?.message ?? ''}`.slice(0, 400))
  })
  let crashed = null
  win.webContents.on('render-process-gone', (_e, d) => { crashed = d?.reason || 'gone' })
  const screens = []
  for (const r of routes) {
    consoleBuf = []
    const since = Date.now()
    // "route@Button text" opens the route, then clicks the button with that text (inner tabs)
    const [route, click] = r.split('@')
    await win.webContents.executeJavaScript(`location.hash = '#${route}'`).catch(() => {})
    if (click) {
      await sleep(2500)
      await win.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(click)})?.click()`).catch(() => {})
    }
    await sleep(Number(process.env.SELFTEST_DELAY || 4000))
    let shot = null
    try {
      shot = path.join(outDir, `${r.replace(/[^\w-]+/g, '_')}.png`)
      fs.writeFileSync(shot, (await win.webContents.capturePage()).toPNG())
    } catch { shot = null }
    const errorCard = await win.webContents.executeJavaScript(`!!document.querySelector('[role="alert"]')`).catch(() => false)
    const ipcErrors = devHistory.filter((h) => h.at >= since && !h.ok).map((h) => `${h.channel}: ${h.error}`)
    screens.push({ route: r, ipcErrors, console: consoleBuf.filter((m) => !/Electron Security Warning|React DevTools|\[vite\]/.test(m)), errorCard, crashed })
    console.log(`[selftest] screen ${r.padEnd(16)} console:${consoleBuf.length} ipcErr:${ipcErrors.length} alert:${errorCard}${ipcErrors.length ? '  ' + ipcErrors.join(' | ').slice(0, 300) : ''}`)
  }

  // ---------------------------------------------------------------- report
  if (process.env.SELFTEST_SCREENS_ONLY) { try { ipc.push(...JSON.parse(fs.readFileSync(path.join(outDir, 'report.json'), 'utf8')).ipc) } catch {} }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ at: new Date().toISOString(), ipc, screens }, null, 1))
  const bad = ipc.filter((x) => !x.ok)
  const slow = ipc.filter((x) => x.ok && x.ms > 3000)
  const md = [
    `# Self-test ${new Date().toISOString()}`, '',
    `IPC de leitura: ${ipc.length} chamados, ${bad.length} com erro, ${slow.length} lentos (>3 s).`, '',
    '## Erros de IPC', '', ...bad.map((x) => `- \`${x.channel}\` (${x.ms} ms): ${x.error}`), '',
    '## Lentos', '', ...slow.map((x) => `- \`${x.channel}\` ${x.ms} ms`), '',
    '## Telas', '', ...screens.map((s) => `- \`${s.route}\`${s.errorCard ? ' **alerta/erro na tela**' : ''}${s.crashed ? ` **renderer caiu: ${s.crashed}**` : ''}${s.console.length ? `\n${s.console.map((m) => `  - ${m}`).join('\n')}` : ''}`), '',
    '## OK', '', ...ipc.filter((x) => x.ok).map((x) => `- \`${x.channel}\` ${x.ms} ms: ${x.result}`)
  ].join('\n')
  fs.writeFileSync(path.join(outDir, 'report.md'), md)
  console.log(`[selftest] done -> ${path.join(outDir, 'report.md')}`)
  app.exit(0)
}
