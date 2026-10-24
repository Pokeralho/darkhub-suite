// Self-test stage for the features added in 0.8: CHANGES THE SYSTEM, runs only with DARKHUB_SELFTEST_MUTATE=1 in a
// disposable VM. Each reversible item: read state -> apply -> state changed -> undo -> state back to the original.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const reg = (args) => { try { return execFileSync('reg.exe', args, { encoding: 'utf8', windowsHide: true }) } catch (e) { return String(e?.stdout || '') } }

export async function runMutations2(call, step, okOf) {
  // ---------------------------------------------------------------- startup manager: a throwaway Run entry
  await step('startup toggle+undo (Run entry)', async () => {
    reg(['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'DarkHubSelftest', '/t', 'REG_SZ', '/d', '"C:\\Windows\\notepad.exe"', '/f'])
    try {
      const find = async () => (await call('startup:list'))?.items?.find((i) => i.key === 'DarkHubSelftest')
      const item = await find()
      if (!item?.enabled) return { ok: false, detail: `not listed/enabled: ${JSON.stringify(item)?.slice(0, 120)}` }
      const off = await call('startup:setEnabled', { item, enabled: false })
      if (!okOf(off)) return { ok: false, detail: `disable: ${off?.error}` }
      if ((await find())?.enabled !== false) return { ok: false, detail: 'still enabled after disable' }
      const u = await call('startup:undo', { index: 0 })
      if (!okOf(u)) return { ok: false, detail: `undo: ${u?.error}` }
      if ((await find())?.enabled !== true) return { ok: false, detail: 'still disabled after undo' }
      return { ok: true, detail: 'disable+undo verified (StartupApproved)' }
    } finally {
      reg(['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'DarkHubSelftest', '/f'])
      reg(['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', '/v', 'DarkHubSelftest', '/f'])
    }
  })

  // ---------------------------------------------------------------- USB policies
  for (const [name, setter, field] of [['usb selective suspend', 'usb:setSelectiveSuspend', 'selectiveSuspend'], ['usb write protect', 'usb:setWriteProtect', 'writeProtect'], ['usb storage block', 'usb:setStorageBlocked', 'storageBlocked']]) {
    await step(`${name} toggle+restore`, async () => {
      const before = (await call('usb:list'))?.policies?.[field]
      const r1 = await call(setter, { on: !before })
      if (!okOf(r1)) return { ok: false, detail: `set: ${r1?.error}` }
      const mid = (await call('usb:list'))?.policies?.[field]
      const r2 = await call(setter, { on: Boolean(before) })
      const after = (await call('usb:list'))?.policies?.[field]
      return { ok: okOf(r2) && mid === !before && Boolean(after) === Boolean(before), detail: `before:${before} mid:${mid} after:${after}` }
    })
  }
  await step('usb list ports', async () => { const r = await call('usb:list'); return { ok: okOf(r), detail: `${r?.ports?.length} ports, history ${r?.history?.length}` } })

  // ---------------------------------------------------------------- scheduled maintenance (manual runs)
  for (const id of ['cleanTemp', 'securityLists', 'wingetUpdates']) {
    await step(`maintenance run ${id}`, async () => { const r = await call('maint:runNow', { id }); return { ok: okOf(r), detail: JSON.stringify(r?.entry?.summary ?? r?.error).slice(0, 160) } })
  }

  // ---------------------------------------------------------------- save backup: custom folder, backup, change, restore
  await step('saves backup+restore (custom folder)', async () => {
    const dir = path.join(os.tmpdir(), 'dh-selftest-save')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'slot1.sav'), 'original')
    await call('saves:setSettings', { custom: [{ name: 'DarkHub Selftest Game', paths: [dir] }], backupRoot: path.join(os.tmpdir(), 'dh-selftest-backups') })
    const scan = await call('saves:scan', {})
    if (!scan?.games?.some((g) => g.name === 'DarkHub Selftest Game' && g.files === 1)) return { ok: false, detail: 'custom game not found' }
    const b = await call('saves:backup', { name: 'DarkHub Selftest Game' })
    if (!b?.ok) return { ok: false, detail: `backup: ${b?.error}` }
    fs.writeFileSync(path.join(dir, 'slot1.sav'), 'changed')
    const r = await call('saves:restore', { name: 'DarkHub Selftest Game', id: b.id })
    const content = fs.readFileSync(path.join(dir, 'slot1.sav'), 'utf8')
    await call('saves:setSettings', { custom: [] })
    return { ok: Boolean(r?.ok) && content === 'original', detail: `restored:${r?.restored} content:${content} safety:${r?.safetyId}` }
  })

  // ---------------------------------------------------------------- benchmark (quick, no disk)
  await step('benchmark quick run', async () => {
    const r = await call('bench:run', { label: 'selftest', quick: true, skipDisk: true })
    return { ok: okOf(r), detail: r?.run ? `cpuMulti ${Math.round(r.run.metrics.cpuMulti?.median)} Mops/s plan ${r.run.context.powerPlan}` : r?.error }
  })

  // ---------------------------------------------------------------- advanced security: hosts lists and hardening
  await step('security hosts apply+restore', async () => {
    // only the small malware list: big lists are refused by design (hosts size cap, see feedParsers.js)
    for (const id of ['stevenblack-unified', 'phishing-filter', 'hagezi-pro-mini', 'hagezi-tif-mini']) await call('security:advSetFeedEnabled', { id, enabled: false })
    await call('security:advSetFeedEnabled', { id: 'urlhaus-filter', enabled: true })
    const big = await call('security:advSetFeedEnabled', { id: 'stevenblack-unified', enabled: true }).then(() => call('security:advUpdateFeeds', {})).then(() => call('security:advApplyHosts', {}))
    await call('security:advSetFeedEnabled', { id: 'stevenblack-unified', enabled: false })
    if (big?.ok || !String(big?.error).startsWith('too-many')) return { ok: false, detail: `big list should be refused, got ${JSON.stringify(big).slice(0, 120)}` }
    const u = await call('security:advUpdateFeeds', {})
    const a = await call('security:advApplyHosts', {})
    if (!okOf(a)) return { ok: false, detail: `apply: ${a?.error} (update ok:${u?.ok})` }
    const hosts = fs.readFileSync('C:\\Windows\\System32\\drivers\\etc\\hosts', 'utf8')
    const r = await call('security:advRestoreHosts', {})
    const hostsAfter = fs.readFileSync('C:\\Windows\\System32\\drivers\\etc\\hosts', 'utf8')
    return { ok: okOf(r) && hostsAfter.length < hosts.length, detail: `applied:${a?.count} lines:${hosts.split('\n').length} after restore:${hostsAfter.split('\n').length} restore:${r?.ok ? `removed ${r.removed}` : r?.error}` }
  })
  await step('security firewall apply+restore', async () => {
    const a = await call('security:advApplyFirewall', {})
    if (!okOf(a)) return { ok: false, detail: `apply: ${a?.error}` }
    const r = await call('security:advRestoreFirewall', {})
    return { ok: okOf(r), detail: `apply:${JSON.stringify(a).slice(0, 80)} restore:${r?.ok}` }
  })
  for (const id of ['llmnrNetbios', 'psLogging', 'smartscreen']) {
    await step(`security hardening ${id} apply+restore`, async () => {
      const state = async () => { const s = await call('security:advHardeningStatus', {}); const list = s?.items || s?.hardening || s?.status || []; return (Array.isArray(list) ? list : []).find((x) => x.id === id)?.applied }
      const before = await state()
      if (before) return { ok: true, detail: 'already applied; skipped to keep the VM as it was' }
      const a = await call('security:advHardeningApply', { id })
      if (!okOf(a)) return { ok: false, detail: `apply: ${a?.error}` }
      const mid = await state()
      const r = await call('security:advHardeningRestore', { id })
      const after = await state()
      return { ok: okOf(r) && mid === true && !after, detail: `before:${before} mid:${mid} after:${after}` }
    })
  }

  // ---------------------------------------------------------------- network latency tweaks
  for (const id of ['ecn', 'interruptModeration']) {
    await step(`network tweak ${id} apply+restore`, async () => {
      const a = await call('network:applyLatencyTweak', { id, value: id === 'ecn' ? 'Enabled' : undefined })
      if (!okOf(a)) return { ok: false, detail: `apply: ${a?.error}` }
      const r = await call('network:restoreLatencyTweak', { id })
      return { ok: okOf(r), detail: `apply:${a?.msg || a?.changed} restore:${r?.msg || r?.ok}` }
    })
  }

  // ---------------------------------------------------------------- drivers: find (and install what Windows Update recommends)
  await step('drivers scan+find', async () => {
    const s = await call('driver:scanMissing')
    const f = await call('driver:findDrivers', {})
    return { ok: okOf(s) && okOf(f), detail: `missing:${JSON.stringify(s?.devices?.length ?? s?.missing?.length)} plan:${JSON.stringify(f).slice(0, 140)}` }
  })

  // ---------------------------------------------------------------- overlay: PresentMon download + window
  await step('overlay show+hide', async () => {
    const s = await call('overlay:show', {})
    await sleep(4000)
    const st = await call('overlay:status')
    const h = await call('overlay:hide')
    return { ok: Boolean(s?.ok && st?.visible && st?.presentMonInstalled && h?.ok), detail: `visible:${st?.visible} pm:${st?.presentMonInstalled} capturing:${st?.capturing} target:${JSON.stringify(st?.target)} err:${st?.error}` }
  })

  // ---------------------------------------------------------------- code runner
  await step('code runner javascript+powershell', async () => {
    const js = await call('code:run', { language: 'javascript', code: 'console.log(6*7)' })
    const ps = await call('code:run', { language: 'powershell', code: 'Write-Output (6*7)' })
    return { ok: js?.stdout?.trim() === '42' && ps?.stdout?.trim() === '42', detail: `js:${js?.stdout?.trim()} ps:${ps?.stdout?.trim()}` }
  })
}
