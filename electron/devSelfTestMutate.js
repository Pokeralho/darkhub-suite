// Self-test stage that CHANGES THE SYSTEM. Runs only with DARKHUB_SELFTEST_MUTATE=1, meant for a disposable VM.
// Every reversible item is checked as: read state -> apply -> state changed -> revert -> state back to original.
import { spawn, execFileSync } from 'node:child_process'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function runMutations(call, log) {
  const rows = []
  const rec = (name, ok, detail, ms) => { rows.push({ channel: name, ok, error: ok ? undefined : String(detail ?? ''), result: ok ? String(detail ?? '').slice(0, 200) : undefined, ms }); log(`${ok ? 'OK ' : 'ERR'} ${name.padEnd(48)} ${String(ms).padStart(6)} ms${ok ? '' : `  -> ${detail}`}`) }
  const only = String(process.env.SELFTEST_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean)
  const step = async (name, fn) => {
    if (only.length && !only.some((o) => name.includes(o))) return
    const t0 = performance.now()
    try { const r = await fn(); rec(name, r === true || r?.ok !== false, r === true ? 'ok' : r?.detail ?? JSON.stringify(r)?.slice(0, 200), Math.round(performance.now() - t0)) }
    catch (e) { rec(name, false, e?.message ?? String(e), Math.round(performance.now() - t0)) }
  }
  const okOf = (r) => r && (r.ok === true || (Array.isArray(r.results) && r.results.every((x) => x.ok)) || (r.ok !== false && !r.error))

  // ---------------------------------------------------------------- registry deep tweaks (apply -> verify -> revert -> verify)
  const tweaks = await call('optimizer:deepTweaksList').catch(() => [])
  // SELFTEST_CLEAN=1: undo (from their snapshots) the selected tweaks left applied by an interrupted run first.
  if (process.env.SELFTEST_CLEAN === '1') {
    const ids = (Array.isArray(tweaks) ? tweaks : []).map((x) => x.id).filter((id) => !only.length || only.some((o) => `tweak ${id}`.includes(o)))
    if (ids.length) log(`clean: ${JSON.stringify(await call('optimizer:deepTweaksRevert', { tweakIds: ids }).catch((e) => e.message)).slice(0, 200)}`)
  }
  const st0 = (await call('optimizer:deepTweaksStatus').catch(() => null))?.status || {}
  for (const tw of Array.isArray(tweaks) ? tweaks : []) {
    const was = Boolean(st0[tw.id])
    await step(`tweak ${tw.id}`, async () => {
      const a = await call('optimizer:deepTweaksApply', { tweakIds: [tw.id] })
      if (!okOf(a)) return { ok: false, detail: `apply: ${a?.error || JSON.stringify(a).slice(0, 160)}` }
      const s1 = (await call('optimizer:deepTweaksStatus'))?.status || {}
      if (!s1[tw.id]) return { ok: false, detail: 'applied but status still off' }
      if (!was) {
        const r = await call('optimizer:deepTweaksRevert', { tweakIds: [tw.id] })
        if (!okOf(r)) return { ok: false, detail: `revert: ${r?.error || JSON.stringify(r).slice(0, 160)}` }
        const s2 = (await call('optimizer:deepTweaksStatus'))?.status || {}
        if (s2[tw.id]) return { ok: false, detail: 'reverted but status still on' }
      }
      return { ok: true, detail: was ? 'was already on; re-applied' : 'apply+revert verified' }
    })
  }

  // ---------------------------------------------------------------- optimizer operations (reversible ones round-trip)
  const ops = await call('optimizer:listOperations').catch(() => [])
  const os0 = (await call('optimizer:checkOperationsStatus').catch(() => null))?.status || {}
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op.revertOf || op.isRevert) continue
    await step(`op ${op.id}`, async () => {
      const a = await call('optimizer:run', { operationIds: [op.id] })
      const ra = a?.results?.[0]
      if (!ra?.ok) return { ok: false, detail: `run: ${ra?.error || ra?.msg || JSON.stringify(a).slice(0, 160)}` }
      if (!op.revertId) return { ok: true, detail: `one-off ok: ${ra.msg || ''}` }
      const s1 = (await call('optimizer:checkOperationsStatus'))?.status || {}
      const applied = s1[op.id]
      if (os0[op.id]) return { ok: true, detail: 'was already on' }
      const r = await call('optimizer:run', { operationIds: [op.revertId] })
      const rr = r?.results?.[0]
      if (!rr?.ok) return { ok: false, detail: `revert: ${rr?.error || rr?.msg}` }
      const s2 = (await call('optimizer:checkOperationsStatus'))?.status || {}
      if (applied === false) return { ok: false, detail: 'ran ok but status did not turn on' }
      if (s2[op.id]) return { ok: false, detail: 'reverted but status still on' }
      return { ok: true, detail: 'apply+revert verified' }
    })
  }

  // ---------------------------------------------------------------- dedicated pairs
  await step('hags set+revert', async () => {
    const before = await call('optimizer:getHagsStatus')
    const s = await call('optimizer:setHagsStatus', { enabled: before?.state !== 'on' })
    if (!okOf(s)) return { ok: false, detail: `set: ${s?.error}` }
    const mid = await call('optimizer:getHagsStatus')
    const r = await call('optimizer:revertHags')
    const after = await call('optimizer:getHagsStatus')
    return { ok: okOf(r) && mid?.state !== before?.state && after?.state === before?.state, detail: `${before?.state} -> ${mid?.state} -> ${after?.state}` }
  })
  await step('dns apply+undo', async () => {
    const before = await call('optimizer:getDnsState')
    const a = await call('optimizer:applyDns', { primary: '1.1.1.1', secondary: '1.0.0.1' })
    const u = await call('optimizer:undoDns', { undoToken: a?.undoToken })
    const after = await call('optimizer:getDnsState')
    return { ok: okOf(a) && okOf(u), detail: `apply:${JSON.stringify(a).slice(0, 120)} undo:${JSON.stringify(u).slice(0, 80)} before:${JSON.stringify(before).slice(0, 80)} after:${JSON.stringify(after).slice(0, 80)}` }
  })
  await step('advanced network apply+revert', async () => {
    const a = await call('optimizer:advancedNetworkApply'); const r = await call('optimizer:advancedNetworkRevert')
    return { ok: okOf(a) && okOf(r), detail: `apply:${a?.ok ?? a?.status} revert:${r?.ok ?? r?.status}` }
  })
  await step('extreme kernel apply+revert', async () => {
    const a = await call('optimizer:applyExtremeKernelMod'); const r = await call('optimizer:revertExtremeKernelMod')
    return { ok: okOf(a) && okOf(r), detail: `apply:${a?.ok ?? a?.status} revert:${r?.ok ?? r?.status}` }
  })
  await step('defender status', async () => { const d = await call('optimizer:getDefenderControlStatus'); return { ok: okOf(d), detail: JSON.stringify(d).slice(0, 160) } })

  // ---------------------------------------------------------------- DLL injector: load a harmless system DLL into notepad
  await step('dll injector (dbghelp.dll -> notepad)', async () => {
    // Windows 11 Notepad is a Store app: the spawned pid can be just a launcher, so check/close every notepad.
    spawn('notepad.exe', [], { detached: true, stdio: 'ignore' }).unref()
    await sleep(3000)
    const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim()
    try {
      const r = await call('injector:inject', { processName: 'notepad', dllPath: 'C:\\Windows\\System32\\dbghelp.dll' })
      const mods = ps("@(Get-Process notepad -ErrorAction SilentlyContinue | ForEach-Object { $_.Modules } | Where-Object ModuleName -eq 'dbghelp.dll').Count")
      return { ok: okOf(r) && Number(mods) > 0, detail: `inject:${JSON.stringify(r).slice(0, 120)} loaded:${mods}` }
    } finally { try { ps('Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force') } catch {} }
  })

  // ---------------------------------------------------------------- camera / capture repair (elevated script + DarkOS revert)
  await step('camera repair', async () => {
    const before = await call('driver:cameraStatus')
    const r = await call('driver:repairCamera')
    return { ok: r?.ok === true && Array.isArray(r.steps) && r.steps.length >= 6, detail: `before:${JSON.stringify(before?.issues)} steps:${JSON.stringify(r?.steps)} after:${JSON.stringify(r?.issues)} err:${r?.error ?? ''}` }
  })

  // ---------------------------------------------------------------- Post-Install Hub: GitHub release (SHA-256) + winget
  await step('setuphub install gridcraft(github)+sumatra(winget)', async () => {
    const log = []
    const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' }).trim()
    const installed = (pattern) => ps(`@(Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '${pattern}' }).Count`)
    const r = await call('setup:installWinget', ['gh:storytold/gridcraft', 'SumatraPDF.SumatraPDF'])
    const grid = installed('*GridCraft*'), sumatra = installed('*SumatraPDF*')
    return { ok: r?.ok !== false && Number(grid) > 0 && Number(sumatra) > 0, detail: `gridcraft:${grid} sumatra:${sumatra} ${log.join(' ')}` }
  })

  // ---------------------------------------------------------------- Windows mode: DarkOS mods on a stock Windows
  // Uses its own state folder, so it also runs on DarkOS: picks mods whose value the system does not have yet.
  await step('winmods apply+revert (registry hklm/hkcu + service)', async () => {
    const { DarkOSRecoveryService } = await import('./services/darkos/DarkOSRecoveryService.js')
    const win = new DarkOSRecoveryService({ mode: 'windows' })
    const cat = (await win.getCatalog()).data || []
    const live = new Map(((await win.getStatus()).data || []).map((s) => [s.id, s.live === true]))
    const st = (await win.getStatus()).data || []
    const absent = new Set(st.filter((s) => s.present === false).map((s) => s.id))
    const off = cat.filter((c) => live.get(c.id) === false && !absent.has(c.id) && !c.securityRelated && !c.rebootRequired)
    const pickOne = (f) => off.find(f)
    const ids = [
      pickOne((c) => c.component === 'registry' && c.scope === 'machine'),
      pickOne((c) => c.component === 'registry' && c.scope === 'defaultUser'),
      pickOne((c) => c.component === 'service')
    ].filter(Boolean).map((c) => c.id)
    if (!ids.length) return { ok: false, detail: 'no off items to test' }
    const a = await win.applyChange({ ids })
    const mid = new Map(((await win.getStatus({ ids })).data || []).map((s) => [s.id, s.live === true]))
    const r = await win.revertChange({ ids })
    const end = new Map(((await win.getStatus({ ids })).data || []).map((s) => [s.id, s.live === true]))
    const ok = a.ok && r.ok && ids.every((id) => mid.get(id) === true && end.get(id) === false)
    return { ok, detail: `${ids.join(',')} apply:${a.ok} live:${ids.map((i) => mid.get(i))} revert:${r.ok} live:${ids.map((i) => end.get(i))} ${a.error || r.error || ''}` }
  })

  await step('ipv-conflict prefer IPv4 then disable IPv6 then undo', async () => {
    const st = async () => (await call('optimizer:deepTweaksStatus'))?.status || {}
    await call('optimizer:deepTweaksRevert', { tweakIds: ['tweak:preferIPv4', 'tweak:disableIPv6'] }).catch(() => null)
    const s0 = await st()
    await call('optimizer:deepTweaksApply', { tweakIds: ['tweak:preferIPv4'] })
    await call('optimizer:deepTweaksApply', { tweakIds: ['tweak:disableIPv6'] })
    const s1 = await st()
    const r = await call('optimizer:deepTweaksRevert', { tweakIds: ['tweak:disableIPv6'] })
    const s2 = await st()
    const ok = s1['tweak:disableIPv6'] === true && s1['tweak:preferIPv4'] === false && r?.ok !== false
      && s2['tweak:disableIPv6'] === s0['tweak:disableIPv6'] && s2['tweak:preferIPv4'] === s0['tweak:preferIPv4']
    return { ok, detail: `before:${s0['tweak:preferIPv4']}/${s0['tweak:disableIPv6']} mid:${s1['tweak:preferIPv4']}/${s1['tweak:disableIPv6']} after:${s2['tweak:preferIPv4']}/${s2['tweak:disableIPv6']} ${r?.error || ''}` }
  })

  // ---------------------------------------------------------------- advanced sensors: helper without driver, PawnIO install, with driver
  await step('hwsensors enable + PawnIO install + disable', async () => {
    // start from a machine without the driver (VM only: this file never runs outside DARKHUB_SELFTEST_MUTATE)
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-Command', `$u = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'PawnIO*' } | Select-Object -First 1
if ($u) { $cmd = if ($u.QuietUninstallString) { $u.QuietUninstallString } else { $u.UninstallString + ' -uninstall -silent' }; Start-Process cmd.exe -ArgumentList '/c', $cmd -Wait -WindowStyle Hidden }
& sc.exe stop PawnIO | Out-Null; & sc.exe delete PawnIO | Out-Null`], { stdio: 'ignore', timeout: 300000 })
    } catch {}
    const s0 = await call('hwsensors:status')
    if (s0?.pawnio) return { ok: false, detail: 'PawnIO still installed before the test' }
    // one action: turning on downloads the pinned PawnIO build, checks SHA-256 + signature, installs it, starts LHM
    const t0 = Date.now()
    const on = await call('hwsensors:setEnabled', { enabled: true })
    let s1
    do { await sleep(500); s1 = await call('hwsensors:status') } while (!(s1?.lastSample > t0) && Date.now() - t0 < 120000)
    const off = await call('hwsensors:setEnabled', { enabled: false })
    await sleep(2500)
    const s3 = await call('hwsensors:status')
    const ok = s0?.available && on?.enabled && !on?.error && s1?.pawnio && s1?.running && s1?.lastSample > t0 && !s3?.running && !off?.enabled
    return { ok, detail: `enable:${on?.enabled} err:${on?.error || ''} reboot:${on?.reboot} driver:${s1?.pawnio} running:${s1?.running} firstSample:${s1?.lastSample > t0 ? s1.lastSample - t0 : 'none'}ms off:${!s3?.running}` }
  })

  await step('hwsensors-driver first sample', async () => {
    const t0 = Date.now()
    await call('hwsensors:setEnabled', { enabled: true })
    let st
    do { await sleep(500); st = await call('hwsensors:status') } while (!(st?.lastSample > t0) && Date.now() - t0 < 60000)
    const firstMs = st?.lastSample > t0 ? st.lastSample - t0 : null
    // one raw sample to see what the CPU exposes with the driver
    let cpu = ''
    try {
      const { HWSENSORS_EXE } = await import('./hal/collectors/HwSensorsDaemon.js')
      const out = await new Promise((resolve) => {
        const p = spawn(HWSENSORS_EXE, ['1000'], { stdio: ['pipe', 'pipe', 'ignore'] })
        let b = ''
        p.stdout.on('data', (d) => { b += d; if (b.includes('\n')) { p.stdin.end(); resolve(b.split('\n')[0]) } })
        setTimeout(() => { try { p.kill() } catch {} resolve(b) }, 45000)
      })
      const j = JSON.parse(out)
      const c = j.hw.find((h) => h.kind === 'Cpu')
      cpu = `pawnio=${j.pawnio} cpuTemps=${JSON.stringify(c?.s.filter((s) => s[0] === 'Temperature').slice(0, 4))} superio=${j.hw.filter((h) => h.kind === 'SuperIO').length}`
    } catch (e) { cpu = `raw sample failed: ${e.message}` }
    await call('hwsensors:setEnabled', { enabled: false })
    return { ok: firstMs !== null && st?.pawnio === true, detail: `first sample after ${firstMs} ms; ${cpu}` }
  })

  // ---------------------------------------------------------------- Windows tab: features (real state), repairs, panels
  await step('wintools features read', async () => {
    const r = await call('wintools:listFeatures')
    return { ok: r?.ok === true && Object.keys(r.features || {}).length === 8, detail: JSON.stringify(r?.features || r?.error) }
  })
  await step('wintools feature legacymedia enable+disable', async () => {
    const before = (await call('wintools:listFeatures'))?.features?.legacymedia
    if (before === 'unavailable') return { ok: true, detail: 'not in this edition' }
    const on = before === 'enabled' || before === 'pending'
    const a = await call('wintools:setFeature', { id: 'legacymedia', enable: !on })
    const b = await call('wintools:setFeature', { id: 'legacymedia', enable: on })
    return { ok: a?.ok === true && b?.ok === true, detail: `${before} -> ${a?.state} -> ${b?.state} ${a?.error || b?.error || ''}` }
  })
  for (const action of ['resetWindowsUpdate', 'repairWinget', 'cleanupComponentStore']) {
    await step(`wintools ${action}`, async () => { const r = await call('wintools:run', { action }); return { ok: r?.ok === true, detail: r?.msg || r?.error } })
  }
  await step('wintools panel devices', async () => {
    const r = await call('wintools:openPanel', { id: 'devices' })
    await sleep(2500)
    const n = execFileSync('powershell.exe', ['-NoProfile', '-Command', '@(Get-Process mmc -ErrorAction SilentlyContinue).Count'], { encoding: 'utf8' }).trim()
    try { execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process mmc -ErrorAction SilentlyContinue | Stop-Process -Force']) } catch {}
    return { ok: r?.ok === true && Number(n) > 0, detail: `mmc:${n}` }
  })

  // ---------------------------------------------------------------- FramePacer / latency / autoclicker
  await step('framepacer start+metrics+stop', async () => {
    const s = await call('framepacer:start', { targetFps: 60, pacingMode: 'balanced' })
    await sleep(3000)
    const m = await call('framepacer:getMetrics')
    const t = await call('framepacer:stop')
    return { ok: okOf(s) && s?.isRunning !== false && okOf(t), detail: `start:${JSON.stringify(s).slice(0, 80)} metrics.running:${m?.isRunning} stop:${t?.isRunning}` }
  })
  await step('framepacer overlay create+close', async () => {
    const c = await call('framepacer:createOverlay'); await sleep(800); const st = await call('framepacer:getOverlayStatus'); const x = await call('framepacer:closeOverlay')
    return { ok: okOf(c) && st?.isOpen === true && okOf(x), detail: `open:${st?.isOpen}` }
  })
  await step('latency ultra enable+disable', async () => {
    const e = await call('latency:enableUltra'); await sleep(1500); const q = await call('latency:queryTimer'); const d = await call('latency:disableUltra')
    return { ok: okOf(e) && okOf(d), detail: `enable:${JSON.stringify(e).slice(0, 220)} disable:${JSON.stringify(d).slice(0, 120)} timer:${JSON.stringify(q).slice(0, 80)}` }
  })
  await step('autoclicker start+stop', async () => {
    const s = await call('autoclicker:start', { cps: 5, button: 'left' }); await sleep(1200); const st = await call('autoclicker:status'); const t = await call('autoclicker:stop')
    return { ok: okOf(s) && okOf(t), detail: `status:${JSON.stringify(st).slice(0, 100)}` }
  })

  // ---------------------------------------------------------------- DarkOS: snapshot + revert/re-apply one registry item
  const isDk = await call('darkos:isDarkOS').catch(() => null)
  if (isDk?.isDarkOS) {
    await step('darkos snapshot create', async () => { const r = await call('darkos:createSnapshot', { name: 'selftest' }); return { ok: okOf(r), detail: JSON.stringify(r).slice(0, 160) } })
    const cat = await call('darkos:getCatalog').catch(() => null)
    const list = Array.isArray(cat?.data) ? cat.data : Array.isArray(cat) ? cat : []
    const item = list.find((c) => c.component === 'registry' && !c.security && !c.requiresConfirmation)
    if (item) {
      await step(`darkos revert+apply ${item.id}`, async () => {
        const r = await call('darkos:revertChange', { ids: [item.id] })
        const a = await call('darkos:applyChange', { ids: [item.id] })
        return { ok: okOf(r) && okOf(a), detail: `revert:${r?.ok} apply:${a?.ok}` }
      })
    }
  }

  // features added in 0.8 (startup, USB, maintenance, saves, benchmark, security, network, drivers, overlay)
  const { runMutations2 } = await import('./devSelfTestMutate2.js')
  await runMutations2(call, step, okOf)
  return rows
}
