// Self-test stage for the audit edge cases: CHANGES THE SYSTEM (temp files, Recycle Bin settings), runs only with
// DARKHUB_SELFTEST_MUTATE=1 in a disposable VM. Drivers on hardware Windows has not identified yet, and the disk map's
// "move to Recycle Bin" on names, long paths, locked files, removable drives and a Recycle Bin too small for the item.
import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ps = (script) => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true })
  return String(r.stdout || '').trim()
}
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`
// Original paths of everything in the Recycle Bin (Shell namespace 10).
const binPaths = () => ps(`[Console]::OutputEncoding = [Text.Encoding]::UTF8; $b = (New-Object -ComObject Shell.Application).Namespace(10); foreach ($i in $b.Items()) { $b.GetDetailsOf($i, 1) + '\\' + $i.Name }`).split(/\r?\n/).filter(Boolean)
const inBin = (p) => { const n = path.basename(p).toLowerCase(); return binPaths().some((x) => x.toLowerCase().endsWith(n)) }

export async function runAuditScenarios(call, step) {
  // ---------------------------------------------------------------- drivers on hardware without a driver
  await step('audit drivers: device without driver is listed', async () => {
    const s = await call('driver:scanMissing')
    if (!s?.ok) return { ok: false, detail: `scan: ${s?.error}` }
    const rows = (s.devices || []).map((d) => `${d.name}|cls=${d.cls}|code=${d.code}|${d.reason}|disp=${d.isDisplay}|gpu=${d.isGpu}`)
    // QEMU virtio-gpu: PCI class 03 (display) with no Windows driver -> must count as a display adapter that needs a driver
    const vgpu = (s.devices || []).find((d) => /VEN_1AF4&DEV_1050/i.test(d.instanceId))
    const ok = !vgpu || (vgpu.isDisplay && vgpu.reason === 'noDriver')
    return { ok, detail: `${s.missing?.length} missing; ${rows.join(' ; ').slice(0, 900)}` }
  })
  await step('audit drivers: detect adapters lists the undriven GPU', async () => {
    const d = await call('driver:detect')
    const names = (d?.adapters || []).map((a) => `${a.model}|${a.pnpId}|${a.status}|${a.problem}`)
    const hasV = names.some((n) => /VEN_1AF4&DEV_1050/i.test(n))
    return { ok: d?.ok !== false && hasV, detail: names.join(' ; ').slice(0, 600) }
  })
  await step('audit drivers: find (no crash, uncovered listed)', async () => {
    const f = await call('driver:findDrivers', {})
    return { ok: f?.ok === true, detail: `items:${f?.items?.length} uncovered:${f?.uncovered?.length} wu:${f?.wu?.error || f?.wu?.count} vendors:${JSON.stringify(f?.vendorLookups)?.slice(0, 200)}` }
  })

  // hardware info on a machine with undriven devices: which category is slow (the whole call passed 30 s in the VM)
  for (const c of ['cpu', 'mainboard', 'memory', 'gpu', 'storage', 'network', 'os', 'monitors']) {
    await step(`audit deep hardware ${c}`, async () => {
      const t0 = Date.now()
      const r = await Promise.race([call('system:getDeepCategory', c, true), sleep(60000).then(() => 'TIMEOUT')])
      const ms = Date.now() - t0
      return { ok: r !== 'TIMEOUT' && ms < 15000, detail: `${ms} ms ${JSON.stringify(r)?.slice(0, 300)}` }
    })
  }

  // ---------------------------------------------------------------- password vault: forgotten master password flow
  await step('audit vault: init, recovery unlock, new master, old one refused', async () => {
    const st = await call('vault:status')
    if (st?.initialized) return { ok: true, detail: 'vault already exists in this profile: flow not run' }
    const init = await call('vault:init', { masterPassword: 'Audit-Master-1' })
    if (!init?.ok || !Array.isArray(init.recoveryWords)) return { ok: false, detail: `init: ${JSON.stringify(init).slice(0, 120)}` }
    if (init.recoveryPassword) return { ok: false, detail: 'init still returns recoveryPassword' }
    const u1 = await call('vault:unlock', { masterPassword: 'Audit-Master-1' })
    const add = await call('vault:add', { site: 'example.test', username: 'u', password: 'audit-fixture-pass', notes: '' })
    await call('vault:lock')
    // forgotten master: words typed in upper case with extra spaces
    const ur = await call('vault:unlockWithRecoveryWords', { words: `  ${init.recoveryWords.join('  ').toUpperCase()} ` })
    const st2 = await call('vault:status')
    const ch = await call('vault:changeMasterPassword', { newMasterPassword: 'Audit-Master-2' })
    await call('vault:lock')
    const old = await call('vault:unlock', { masterPassword: 'Audit-Master-1' })
    const neu = await call('vault:unlock', { masterPassword: 'Audit-Master-2' })
    const list = await call('vault:list')
    const n = (list?.entries || list?.items || list || []).length
    const ok = u1?.ok && add?.ok !== false && ur?.ok && st2?.unlockedVia === 'recovery' && ch?.ok && Array.isArray(ch.recoveryWords) && !old?.ok && neu?.ok && n === 1
    return { ok, detail: `unlock:${u1?.ok} add:${add?.ok} recovery:${ur?.ok} via:${st2?.unlockedVia} change:${ch?.ok}/${ch?.error || ''} old:${old?.ok} new:${neu?.ok} entries:${n} ${JSON.stringify(list).slice(0, 80)}` }
  })

  // ---------------------------------------------------------------- disk map: move to Recycle Bin
  const scan = async (root) => {
    const s = await call('diskscan:start', { root })
    if (!s?.ok) throw new Error(`start: ${s?.error}`)
    const t0 = Date.now()
    let st
    do { await sleep(300); st = await call('diskscan:status') } while (st?.running && Date.now() - t0 < 60000)
    return st
  }
  // Every node of the scan, depth-first: [{ id, name, kind, path }]
  const nodes = async () => {
    const out = []
    const walk = async (id, base) => {
      const v = await call('diskscan:view', { id, minFraction: 0, maxNodes: 20000 })
      for (const c of v?.tree?.children || []) {
        if (c.kind !== 'dir' && c.kind !== 'file') continue
        const p = `${base.replace(/\\+$/, '')}\\${c.name}`
        out.push({ id: c.id, name: c.name, kind: c.kind, path: p, size: c.size })
        if (c.kind === 'dir') await walk(c.id, p)
      }
    }
    const v0 = await call('diskscan:view', { id: 'd0' })
    await walk('d0', v0?.tree?.name || '')
    return out
  }
  const big = (p, mb) => { const fd = fs.openSync(p, 'w'); fs.ftruncateSync(fd, mb * 1024 * 1024); fs.writeSync(fd, 'x', mb * 1024 * 1024 - 1); fs.closeSync(fd) }
  const makeTree = (root) => {
    // read-only files left by an earlier run: Remove-Item -Force clears them where rmSync gets EPERM
    if (fs.existsSync(root)) ps(`Remove-Item -LiteralPath ${psq(root)} -Recurse -Force -ErrorAction SilentlyContinue`)
    fs.mkdirSync(path.join(root, 'pasta com espaço'), { recursive: true })
    fs.writeFileSync(path.join(root, 'normal.txt'), 'a'.repeat(5000))
    fs.writeFileSync(path.join(root, 'ação ü 日本.txt'), 'b'.repeat(5000))
    fs.writeFileSync(path.join(root, "it's [1] & $x.txt"), 'c'.repeat(5000))
    fs.writeFileSync(path.join(root, 'pasta com espaço', 'dentro.txt'), 'd'.repeat(5000))
    fs.writeFileSync(path.join(root, 'readonly.txt'), 'e'.repeat(5000)); fs.chmodSync(path.join(root, 'readonly.txt'), 0o444)
    fs.mkdirSync(path.join(root, 'travada'), { recursive: true })
    fs.writeFileSync(path.join(root, 'travada', 'aberto.txt'), 'f'.repeat(5000))
    fs.writeFileSync(path.join(root, 'travada', 'livre.txt'), 'g'.repeat(5000))
    let deep = path.join(root, 'longo')
    while (deep.length < 300) deep = path.join(deep, 'subpasta_com_nome_comprido')
    fs.mkdirSync(`\\\\?\\${deep}`, { recursive: true })
    fs.writeFileSync(`\\\\?\\${path.join(deep, 'fundo.txt')}`, 'h'.repeat(5000))
  }
  // Holds a file open with no sharing, like an app that has it open, until the returned function is called.
  const lock = (file) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', `$f = [IO.File]::Open(${psq(file)}, 'Open', 'Read', 'None'); Start-Sleep 120`], { windowsHide: true })
    return () => { try { p.kill() } catch { /* gone */ } }
  }
  const trashCase = async (name, items, pick, expect) => {
    await step(`audit diskmap: ${name}`, async () => {
      const n = items.find(pick)
      if (!n) return { ok: false, detail: 'node not found in scan' }
      const r = await call('diskscan:trash', { id: n.id })
      await sleep(400)
      const exists = fs.existsSync(`\\\\?\\${n.path}`)
      const bin = inBin(n.path)
      const verdict = expect({ r, exists, bin })
      return { ok: verdict === true, detail: `${verdict === true ? '' : verdict + ' :: '}ok=${r?.ok} err=${r?.error || ''} exists=${exists} inBin=${bin}` }
    })
  }
  const safe = ({ r, exists, bin }) => (r?.ok ? (!exists && bin ? true : `reported ok but exists=${exists} inBin=${bin}`) : (exists ? true : 'reported failure but the item is gone'))

  // a fresh folder per run: files locked or read-only from an interrupted run cannot get in the way
  let C = `C:\\dhaudit-${Date.now()}`
  makeTree(C)
  let release = lock(path.join(C, 'travada', 'aberto.txt'))
  await sleep(1500)
  try {
    await scan(C)
    const items = await nodes()
    await trashCase('C: plain file', items, (x) => x.name === 'normal.txt', safe)
    await trashCase('C: unicode name', items, (x) => x.name === 'ação ü 日本.txt', safe)
    await trashCase('C: apostrophe/brackets/$ name', items, (x) => x.name === "it's [1] & $x.txt", safe)
    await trashCase('C: read-only file', items, (x) => x.name === 'readonly.txt', safe)
    await trashCase('C: folder with spaces', items, (x) => x.name === 'pasta com espaço', safe)
    await trashCase('C: file in path > 260', items, (x) => x.name === 'fundo.txt', safe)
    await trashCase('C: folder with a locked file', items, (x) => x.name === 'travada', ({ r, exists }) => {
      if (r?.ok) return exists ? 'reported ok but folder still there' : true
      const locked = fs.existsSync(path.join(C, 'travada', 'aberto.txt'))
      const free = fs.existsSync(path.join(C, 'travada', 'livre.txt'))
      return exists && locked && free ? true : `partial move: aberto=${locked} livre=${free} (map now out of date)`
    })
    // the map must still answer for the parent after the trashes
    await step('audit diskmap: view after trash', async () => {
      const v = await call('diskscan:view', { id: 'd0' })
      return { ok: v?.ok === true, detail: `size=${v?.tree?.size} children=${v?.tree?.children?.map((c) => c.name).join(',')}` }
    })
  } finally { release(); await sleep(2000) }

  // Recycle Bin smaller than the item: Windows would delete it for good instead of recycling it.
  const volGuid = ps(`(Get-CimInstance Win32_Volume | Where-Object DriveLetter -eq 'C:').DeviceID`).replace(/^\\\\\?\\Volume|\\$/g, '')
  const bb = `HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\BitBucket\\Volume\\${volGuid}`
  const prev = ps(`(Get-ItemProperty -LiteralPath ${psq(bb)} -ErrorAction SilentlyContinue).MaxCapacity`)
  try {
    ps(`if (-not (Test-Path -LiteralPath ${psq(bb)})) { New-Item -Path ${psq(bb)} -Force | Out-Null }; Set-ItemProperty -LiteralPath ${psq(bb)} -Name MaxCapacity -Value 2 -Type DWord`)
    C = `${C}-b`
    makeTree(C)
    big(path.join(C, 'grande.bin'), 8)
    await scan(C)
    const items = await nodes()
    await trashCase('C: 8 MB file, Recycle Bin capped at 2 MB', items, (x) => x.name === 'grande.bin', ({ r, exists, bin }) => {
      if (!exists && !bin) return 'PERMANENTLY DELETED while the UI promised the Recycle Bin'
      return safe({ r, exists, bin })
    })
  } finally {
    ps(prev ? `Set-ItemProperty -LiteralPath ${psq(bb)} -Name MaxCapacity -Value ${Number(prev)} -Type DWord` : `Remove-ItemProperty -LiteralPath ${psq(bb)} -Name MaxCapacity -ErrorAction SilentlyContinue`)
  }

  // Removable drive (FAT32/exFAT USB stick): it has no Recycle Bin at all.
  const usb = ps(`(Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | Select-Object -First 1).DriveLetter`)
  if (usb) {
    const U = `${usb}:\\dhaudit-${Date.now()}`
    makeTree(U)
    await scan(U)
    const items = await nodes()
    await trashCase(`${usb}: (removable) plain file`, items, (x) => x.name === 'normal.txt', ({ r, exists, bin }) => {
      if (!exists && !bin) return 'PERMANENTLY DELETED while the UI promised the Recycle Bin'
      return safe({ r, exists, bin })
    })
    // the explicit "delete for good": refused with a wrong name, done with the typed name (folder + read-only file)
    await step(`audit diskmap: ${usb}: delete for good (typed name)`, async () => {
      const n = items.find((x) => x.name === 'pasta com espaço')
      const ro = items.find((x) => x.name === 'readonly.txt')
      if (!n || !ro) return { ok: false, detail: 'nodes not found' }
      const wrong = await call('diskscan:deletePermanent', { id: n.id, confirmName: 'pasta' })
      const stillThere = fs.existsSync(n.path)
      const a = await call('diskscan:deletePermanent', { id: n.id, confirmName: 'pasta com espaço' })
      const b = await call('diskscan:deletePermanent', { id: ro.id, confirmName: 'readonly.txt' })
      const ok = !wrong?.ok && stillThere && a?.ok && b?.ok && !fs.existsSync(n.path) && !fs.existsSync(ro.path)
      return { ok, detail: `wrong:${wrong?.ok} kept:${stillThere} folder:${a?.ok}/${a?.error || ''} readonly:${b?.ok}/${b?.error || ''}` }
    })
  } else {
    await step('audit diskmap: removable drive', async () => ({ ok: false, detail: 'no removable volume attached' }))
  }
}
