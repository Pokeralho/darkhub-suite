// Partitioning (Disk Studio) through the Windows Storage module. Partition numbers here are the ones Windows uses;
// they can differ from the slot numbers of the Rust engine (`inspect`), so operations only use this listing.
// Flow: plan() reads everything and returns a preview; apply() takes only that plan's id and the disk name the user
// typed, reads everything again, and hands one operation to partition-ops.ps1. The renderer never names a target
// at apply time, so what runs is what was previewed.
import crypto from 'node:crypto'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runPowerShell } from '../PowerShellRunner.js'
import { evaluate, normalizeRequest, predict, verify } from './partitionPolicy.js'

const MIB = 1024 ** 2
const PLAN_TTL_MS = 5 * 60 * 1000

function defaultScript() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked'), 'partition-ops.ps1')
}
/** Gaps smaller than this are alignment leftovers, not usable free space. */
export const MIN_FREE_BYTES = 8 * MIB

const GPT_ROLES = {
  'c12a7328-f81f-11d2-ba4b-00a0c93ec93b': 'esp',
  'e3c9e316-0b5c-4db8-817d-f92df00215ae': 'msr',
  'de94bba4-06d1-4d40-a16a-bfd50179d6ac': 'recovery',
  'ebd0a0a2-b9e5-4433-87c0-68b6b72699c7': 'basic',
  '5808c8aa-7e8f-42e0-85d2-e1e90434cfb3': 'dynamic',
  'af9b60a0-1431-4f62-bc68-3311714a69ad': 'dynamic',
  'e75caf8f-f680-4cee-afa3-b001e56efc2d': 'spaces',
  '0fc63daf-8483-4772-8e79-3d69d8477de4': 'linux',
  '0657fd6d-a4ab-43c4-84e5-0933c84b4f4f': 'linux',
  'e6d6d379-f507-44c2-a23c-238f2a3df928': 'linux',
  '4f68bce3-e8cd-4db1-96e7-fbcaf984b709': 'linux'
}
const MBR_ROLES = { 5: 'extended', 15: 'extended', 66: 'dynamic', 39: 'recovery', 131: 'linux', 130: 'linux', 142: 'linux', 239: 'esp' }

/** What a partition is for. Anything not recognised is 'unknown', and later stages must treat that as protected. */
export function partitionRole({ gptType, mbrType }) {
  if (gptType) return GPT_ROLES[String(gptType).replace(/[{}]/g, '').toLowerCase()] ?? 'unknown'
  if (mbrType === null || mbrType === undefined) return 'unknown'
  return MBR_ROLES[Number(mbrType)] ?? 'basic'
}

/** WMI ConversionStatus 0 = fully decrypted. A suspended volume has ProtectionStatus 0 but is still encrypted. */
export function bitlockerState(row) {
  if (!row) return 'unknown'
  return row.conversion === 0 && row.protection === 0 ? 'off' : 'on'
}

/**
 * The first sector settles what WMI could not: a BitLocker volume starts with -FVE-FS-, which the engine reports as
 * fs "BitLocker". DarkOS and locked-down builds may have no WMI provider at all.
 */
export function withRawBitlocker(disk, inspect) {
  if (!inspect?.layout) return disk
  const partitions = disk.partitions.map((p) => {
    const raw = inspect.layout.find((i) => i.offset === p.offset)
    if (!raw) return p
    if (raw.fs === 'BitLocker') return { ...p, bitlocker: 'on' }
    return p.bitlocker === 'unknown' ? { ...p, bitlocker: 'off' } : p
  })
  return { ...disk, partitions }
}

/** Everything that identifies this disk and its layout. A plan is void as soon as this changes. */
export function fingerprint(d) {
  const parts = d.partitions.map((p) => [p.number, p.offset, p.size, p.guid, p.letter, p.fileSystem, p.label])
  return crypto.createHash('sha256').update(JSON.stringify([d.number, d.name, d.serial, d.uniqueId, d.guid, d.size, d.style, parts])).digest('hex')
}

/** Free gaps of a disk, from the end of the first MiB to the last usable byte. */
export function freeGaps(partitions, diskSize, style) {
  const start = MIB
  const end = style === 'GPT' ? diskSize - MIB : diskSize
  const gaps = []
  let cursor = start
  for (const p of [...partitions].sort((a, b) => a.offset - b.offset)) {
    if (p.offset > cursor) gaps.push({ offset: cursor, size: p.offset - cursor })
    cursor = Math.max(cursor, p.offset + p.size)
  }
  if (end > cursor) gaps.push({ offset: cursor, size: end - cursor })
  return gaps.filter((g) => g.size >= MIN_FREE_BYTES)
}

const asList = (v) => (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v])
const letterOf = (v) => {
  const s = String(v ?? '').trim().toUpperCase()
  return /^[A-Z]$/.test(s) ? s : null
}

/** Raw rows from LIST_SCRIPT -> disks with their partitions, in disk-number order. */
export function shapeListing(raw) {
  const volumes = asList(raw.volumes)
  const encryption = new Map(asList(raw.encryption).map((e) => [String(e.path).toLowerCase(), e]))
  const pagefiles = new Set(asList(raw.pagefiles).map((p) => String(p).toUpperCase()))
  const systemLetter = letterOf(raw.systemDrive)
  const parts = asList(raw.partitions)

  const disks = asList(raw.disks).map((d) => {
    const style = String(d.style || 'Unknown')
    const partitions = parts.filter((p) => p.disk === d.number).map((p) => {
      const accessPaths = asList(p.accessPaths).filter(Boolean).map(String)
      const volumePath = accessPaths.find((a) => /^\\\\\?\\Volume\{/i.test(a)) ?? null
      const vol = volumePath ? volumes.find((v) => String(v.path).toLowerCase() === volumePath.toLowerCase()) : null
      const letter = letterOf(p.letter)
      return {
        number: p.number,
        offset: p.offset,
        size: p.size,
        guid: String(p.guid || ''),
        isLogical: p.type === 'Logical',
        role: partitionRole(p),
        letter,
        mountPaths: accessPaths.filter((a) => a !== volumePath && !/^[A-Za-z]:\\$/.test(a)),
        isBoot: !!p.isBoot,
        isSystem: !!p.isSystem,
        isActive: !!p.isActive,
        isHidden: !!p.isHidden,
        fileSystem: vol?.fs || null,
        label: vol?.label || '',
        free: vol ? vol.free : null,
        volumePath,
        bitlocker: !vol ? 'none' : raw.encryptionRead ? bitlockerState(encryption.get(String(vol.path).toLowerCase())) : 'unknown',
        hasPagefile: !!letter && pagefiles.has(letter),
        isWindows: !!letter && letter === systemLetter
      }
    }).sort((a, b) => a.offset - b.offset)
    return {
      number: d.number,
      name: String(d.name || '').trim(),
      serial: String(d.serial || '').trim(),
      uniqueId: String(d.uniqueId || ''),
      guid: String(d.guid || ''),
      bus: String(d.bus || ''),
      style,
      size: d.size,
      sectorSize: d.sectorSize || 512,
      isBoot: !!d.isBoot,
      isSystem: !!d.isSystem,
      isOffline: !!d.isOffline,
      isReadOnly: !!d.isReadOnly,
      isClustered: !!d.isClustered,
      partitions,
      free: freeGaps(partitions, d.size, style)
    }
  }).sort((a, b) => a.number - b.number)
  return { elevated: !!raw.elevated, usedLetters: asList(raw.usedLetters).map(letterOf).filter(Boolean), disks }
}

/** No input reaches this script. BitLocker is read through WMI because the cmdlet is missing from some builds. */
export const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$id = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
$enc = @(); $encRead = $false
try {
  $enc = @(Get-CimInstance -Namespace 'root\\cimv2\\security\\microsoftvolumeencryption' -ClassName Win32_EncryptableVolume | ForEach-Object {
    [pscustomobject]@{ path = $_.DeviceID; protection = $_.ProtectionStatus; conversion = $_.ConversionStatus }
  })
  $encRead = $true
} catch { }
$pf = @()
try { $pf = @(Get-CimInstance Win32_PageFileUsage | ForEach-Object { ([string]$_.Name).Substring(0, 1) }) } catch { }
# letters of the session plus persistent network drives, which an elevated process does not see as mounted
$used = @([IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name.Substring(0, 1) })
try { $used += @(Get-ChildItem 'HKCU:\\Network' -ErrorAction Stop | ForEach-Object { $_.PSChildName }) } catch { }
[pscustomobject]@{
  usedLetters = $used
  elevated = $id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  systemDrive = ([string]$env:SystemDrive).Substring(0, 1)
  encryptionRead = $encRead
  encryption = $enc
  pagefiles = $pf
  disks = @(Get-Disk | ForEach-Object {
    [pscustomobject]@{
      number = [int]$_.Number; name = $_.FriendlyName; serial = $_.SerialNumber; uniqueId = $_.UniqueId; guid = $_.Guid; bus = [string]$_.BusType
      style = [string]$_.PartitionStyle; size = [double]$_.Size; sectorSize = [int]$_.LogicalSectorSize
      isBoot = [bool]$_.IsBoot; isSystem = [bool]$_.IsSystem; isOffline = [bool]$_.IsOffline
      isReadOnly = [bool]$_.IsReadOnly; isClustered = [bool]$_.IsClustered
    }
  })
  partitions = @(Get-Partition | ForEach-Object {
    [pscustomobject]@{
      disk = [int]$_.DiskNumber; number = [int]$_.PartitionNumber; offset = [double]$_.Offset; size = [double]$_.Size
      letter = [string]$_.DriveLetter; gptType = $_.GptType; mbrType = $_.MbrType; accessPaths = @($_.AccessPaths)
      guid = $_.Guid; type = [string]$_.Type
      isBoot = [bool]$_.IsBoot; isSystem = [bool]$_.IsSystem; isActive = [bool]$_.IsActive; isHidden = [bool]$_.IsHidden
    }
  })
  volumes = @(Get-Volume | ForEach-Object {
    [pscustomobject]@{ path = $_.Path; fs = [string]$_.FileSystemType; label = $_.FileSystemLabel; free = [double]$_.SizeRemaining }
  })
} | ConvertTo-Json -Compress -Depth 4`

export class PartitionService {
  /** recovery: DiskRecoveryService (engine). appPaths: folders the app runs from; their volumes are never touched. */
  constructor({ powershell = runPowerShell, recovery = null, appPaths = [], spawnImpl = spawn, scriptPath = defaultScript(), now = Date.now } = {}) {
    this.powershell = powershell
    this.recovery = recovery
    this.appPaths = appPaths
    this.spawn = spawnImpl
    this.scriptPath = scriptPath
    this.now = now
    this.plans = new Map()
    this.running = false
  }

  async list() {
    const r = await this.powershell(LIST_SCRIPT, { timeoutMs: 60000, trim: true })
    try {
      return { ok: true, ...shapeListing(JSON.parse(r.stdout)) }
    } catch {
      return { ok: false, error: (r.stderr || 'Não foi possível ler os discos.').trim() }
    }
  }

  /** Runs the fixed script with one base64 JSON argument and returns its "DKPART|" result. Never killed: see below. */
  _exec(payload) {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, '-Payload', b64]
    return new Promise((resolve) => {
      // no timeout on purpose: stopping PowerShell in the middle of a resize is worse than waiting for it
      const p = this.spawn(exe, args, { windowsHide: true })
      let out = ''
      let err = ''
      p.stdout.on('data', (d) => { out += d.toString('utf8') })
      p.stderr.on('data', (d) => { err += d.toString('utf8') })
      p.on('error', (e) => resolve({ ok: false, code: 'failed', written: false, detail: e.message }))
      p.on('close', (code) => {
        const line = out.split(/\r?\n/).find((l) => l.startsWith('DKPART|'))
        try { resolve(JSON.parse(line.slice(7))) } catch { resolve({ ok: false, code: 'failed', written: null, detail: err.trim() || `PowerShell ${code}` }) }
      })
    })
  }

  _payload(req, disk) {
    return {
      ...req,
      disk: { number: disk.number, name: disk.name, serial: disk.serial, size: disk.size },
      layout: disk.partitions.map((p) => ({ number: p.number, offset: p.offset, size: p.size }))
    }
  }

  async _probeLocks(number) {
    const r = await this.recovery?.run(['probe-lock', `disk:${number}`])
    const locks = new Map()
    for (const v of r?.volumes ?? []) locks.set(`${String(v.volume).replace(/\\$/, '')}\\`.toLowerCase(), v.lockable === true)
    return locks
  }

  /** Volumes the partition table does not describe (a USB stick with no table, say): read their first sector. */
  async _settleBitlocker(disk) {
    const partitions = await Promise.all(disk.partitions.map(async (p) => {
      if (p.bitlocker !== 'unknown') return p
      const r = await this.recovery?.readSector({ target: `disk:${disk.number}`, lba: p.offset / disk.sectorSize })
      if (!r?.ok) return p
      return { ...p, bitlocker: r.decoded?.oem_id === '-FVE-FS-' ? 'on' : 'off' }
    }))
    return { ...disk, partitions }
  }

  /** Reads everything the rules need, fresh. */
  async _context(req) {
    const listing = await this.list()
    if (!listing.ok) return { error: listing.error }
    const found = listing.disks.find((d) => d.number === req.disk)
    if (!found) return { error: 'Disco não encontrado.', code: 'no_disk' }
    const [drives, inspect, locks] = await Promise.all([
      this.recovery?.listDrives(),
      this.recovery?.inspectDisk({ target: `disk:${req.disk}` }),
      this._probeLocks(req.disk)
    ])
    const disk = await this._settleBitlocker(withRawBitlocker(found, inspect?.ok ? inspect : null))
    let limits = null
    if (req.op === 'resize') {
      const r = await this._exec({ op: 'limits', disk: { number: req.disk }, partition: req.partition })
      if (r.ok) limits = { min: r.min, max: r.max }
    }
    const appLetters = this.appPaths.map((p) => letterOf(String(p).slice(0, 1))).filter(Boolean)
    return {
      disk,
      ctx: {
        elevated: listing.elevated,
        usedLetters: listing.usedLetters,
        engineSystem: drives?.ok ? drives.system_disks : null,
        jobBusy: !!this.recovery?.status().running || this.running,
        appLetters,
        inspect: inspect?.ok ? inspect : null,
        locks,
        limits
      }
    }
  }

  /** Shrink and extend bounds for the size field. Reads only. */
  async limits(p) {
    const r = await this._exec({ op: 'limits', disk: { number: Number(p.disk) }, partition: Number(p.partition) })
    return r.ok ? { ok: true, min: r.min, max: r.max } : { ok: false, code: r.code, error: r.detail || r.code }
  }

  /** Writes nothing. A plan with blockers gets no id, so it cannot be applied. */
  async plan(raw) {
    const req = normalizeRequest(raw)
    const c = await this._context(req)
    if (c.error) return { ok: false, code: c.code, error: c.error }
    const { blockers, warnings, dataLoss } = evaluate(req, c.disk, c.ctx)
    const after = predict(req, c.disk)
    let planId = null
    if (!blockers.length) {
      for (const [id, p] of this.plans) if (p.expires <= this.now()) this.plans.delete(id)
      planId = crypto.randomUUID()
      this.plans.set(planId, { req, print: fingerprint(c.disk), dataLoss, expires: this.now() + PLAN_TTL_MS })
    }
    return { ok: true, planId, op: req.op, diskName: c.disk.name, before: c.disk, after, blockers, warnings, dataLoss, limits: c.ctx.limits }
  }

  /** Runs a plan once. `confirmName` must be the disk's exact name; `ack` is required when data is lost. */
  async apply({ planId, confirmName, ack } = {}) {
    const plan = this.plans.get(planId)
    if (!plan || plan.expires <= this.now()) { this.plans.delete(planId); return { ok: false, code: 'plan_expired' } }
    if (this.running) return { ok: false, code: 'job_running' }
    if (this.recovery && !this.recovery.reserve('partition')) return { ok: false, code: 'job_running' }
    this.running = true
    try {
      this.plans.delete(planId)
      const { req } = plan
      const c = await this._context(req)
      if (c.error) return { ok: false, code: c.code, error: c.error }
      if (fingerprint(c.disk) !== plan.print) return { ok: false, code: 'disk_changed' }
      if (String(confirmName ?? '') !== c.disk.name) return { ok: false, code: 'confirm_name' }
      if (plan.dataLoss && ack !== true) return { ok: false, code: 'confirm_ack' }
      c.ctx.jobBusy = false // our own reservation
      const { blockers } = evaluate(req, c.disk, c.ctx)
      if (blockers.length) return { ok: false, code: 'blocked', blockers }

      let backupFile = null
      if (['create', 'delete', 'resize'].includes(req.op)) {
        const b = await this.recovery.backupTable({ target: `disk:${req.disk}` })
        if (!b?.ok) return { ok: false, code: 'backup_failed', error: b?.error }
        backupFile = b.out
      }

      const r = await this._exec(this._payload(req, c.disk))
      const listing = await this.list()
      const now = listing.ok ? listing.disks.find((d) => d.number === req.disk) : null
      const mismatches = now ? verify(req, predict(req, c.disk), now) : ['unread']
      const result = { backupFile, partition: r.partition ?? req.partition ?? null, disk: now ?? null, mismatches }
      if (!r.ok) return { ok: false, code: r.code, error: r.detail, written: r.written, ...result }
      return mismatches.length ? { ok: false, code: 'verify_failed', written: true, ...result } : { ok: true, ...result }
    } finally {
      this.running = false
      this.recovery?.release('partition')
    }
  }
}

export default PartitionService
