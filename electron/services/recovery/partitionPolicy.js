// What may be done to a disk: pure rules, no I/O. Every refusal lives here so it can be tested without touching a
// disk. Unknown data counts as "no": a state we could not read blocks the operation.
import { freeGaps } from './PartitionService.js'

const MIB = 1024 ** 2
const GIB = 1024 ** 3
const TIB = 1024 ** 4
export const MIN_PARTITION_BYTES = 16 * MIB
/** Windows may round a size to its own alignment; a difference under this is not a failure. */
const TOLERANCE = 2 * MIB

export const FILE_SYSTEMS = {
  NTFS: { maxLabel: 32 },
  exFAT: { maxLabel: 15 },
  FAT32: { maxLabel: 11, maxSize: 32 * GIB }
}
const OPS = ['init', 'create', 'delete', 'resize', 'format', 'letter']

const whole = (v, name, min, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${name} inválido.`)
  return n
}
const alignedMib = (v, name) => {
  const n = whole(v, name, 1)
  if (n % MIB) throw new Error(`${name} precisa ser múltiplo de 1 MiB.`)
  return n
}
const fileSystem = (v) => {
  if (!Object.hasOwn(FILE_SYSTEMS, String(v))) throw new Error('Sistema de arquivos inválido.')
  return String(v)
}
const label = (v, fs) => {
  const s = String(v ?? '').trim()
  // eslint-disable-next-line no-control-regex
  if (s.length > FILE_SYSTEMS[fs].maxLabel || /[\x00-\x1f"*/:<>?\\|]/.test(s)) throw new Error('Rótulo inválido.')
  return s
}
const driveLetter = (v) => {
  const s = String(v ?? '').trim().toUpperCase()
  if (!/^[D-Z]$/.test(s)) throw new Error('Letra de unidade inválida (use de D a Z).')
  return s
}

/** Keeps only the fields of the operation, validated. Throws on anything else. */
export function normalizeRequest(r = {}) {
  if (!OPS.includes(r.op)) throw new Error('Operação inválida.')
  const out = { op: r.op, disk: whole(r.disk, 'Disco', 0, 63) }
  if (r.op === 'init') return out
  if (r.op === 'create') {
    const fs = fileSystem(r.fs)
    return { ...out, offset: alignedMib(r.offset, 'Início'), size: alignedMib(r.size, 'Tamanho'), fs, label: label(r.label, fs), letter: r.letter ? driveLetter(r.letter) : null }
  }
  out.partition = whole(r.partition, 'Partição', 1, 128)
  if (r.op === 'resize') out.newSize = alignedMib(r.newSize, 'Tamanho')
  if (r.op === 'format') {
    out.fs = fileSystem(r.fs)
    out.label = label(r.label, out.fs)
    out.full = r.full === true
  }
  if (r.op === 'letter') out.letter = driveLetter(r.letter)
  return out
}

/** Reasons the whole disk is off limits. */
function diskBlockers(disk, ctx) {
  const b = []
  if (!ctx.elevated) b.push('not_elevated')
  if (ctx.jobBusy) b.push('job_running')
  if (!Array.isArray(ctx.engineSystem)) b.push('engine_unavailable')
  const parts = disk.partitions
  const isSystem = disk.isBoot || disk.isSystem || ctx.engineSystem?.includes(disk.number) ||
    parts.some((p) => p.isBoot || p.isSystem || p.isWindows)
  if (isSystem) b.push('system_disk')
  if (parts.some((p) => p.role === 'esp')) b.push('efi_disk')
  if (parts.some((p) => p.role === 'dynamic' || p.role === 'spaces')) b.push('unsupported_disk')
  if (disk.isOffline) b.push('disk_offline')
  if (disk.isReadOnly) b.push('disk_readonly')
  if (disk.isClustered) b.push('disk_clustered')
  if (!disk.name) b.push('disk_unnamed')
  return b
}

/** Reasons this partition cannot be changed, whatever the operation. */
function partitionBlockers(p, req, ctx) {
  const b = []
  const roles = req.op === 'delete' ? ['basic', 'linux'] : ['basic']
  if (!roles.includes(p.role)) b.push('protected_partition')
  if (p.isBoot || p.isSystem || p.isWindows) b.push('system_partition')
  if (p.hasPagefile) b.push('pagefile')
  if (p.letter && ctx.appLetters?.includes(p.letter)) b.push('app_volume')
  return b
}

const volumeInUse = (p, ctx) => !p.volumePath || ctx.locks?.get(p.volumePath.toLowerCase()) !== true

function createChecks(req, disk, b) {
  const end = req.offset + req.size
  if (disk.style === 'RAW') b.push('not_initialized')
  if (!disk.free.some((g) => req.offset >= g.offset && end <= g.offset + g.size)) b.push('outside_free_space')
  if (req.size < MIN_PARTITION_BYTES) b.push('too_small')
  if (FILE_SYSTEMS[req.fs].maxSize && req.size > FILE_SYSTEMS[req.fs].maxSize) b.push('fat32_too_big')
  if (disk.style === 'MBR') {
    if (disk.partitions.filter((p) => !p.isLogical).length >= 4) b.push('mbr_full')
    if (end > 2 * TIB) b.push('mbr_limit')
  }
}

function resizeChecks(req, p, disk, ctx, b) {
  if (p.fileSystem !== 'NTFS') b.push('resize_ntfs_only')
  if (p.bitlocker !== 'off' && p.bitlocker !== 'none') b.push('bitlocker')
  if (!ctx.limits) { b.push('limits_unknown'); return }
  if (req.newSize === p.size) b.push('same_size')
  if (req.newSize < ctx.limits.min) b.push('below_minimum')
  if (req.newSize > ctx.limits.max) b.push('above_maximum')
  if (req.newSize > p.size) {
    const next = disk.free.find((g) => g.offset >= p.offset + p.size && g.offset - (p.offset + p.size) < MIB)
    if (!next || req.newSize - p.size > next.size + (next.offset - (p.offset + p.size))) b.push('no_space_after')
  }
}

/** { blockers, warnings, dataLoss } for one request. ctx comes from PartitionService, read just before this call. */
export function evaluate(req, disk, ctx) {
  const b = diskBlockers(disk, ctx)
  const w = []
  let dataLoss = false

  if (req.op === 'init') {
    if (disk.style !== 'RAW' || disk.partitions.length) b.push('already_initialized')
    if (!ctx.inspect) b.push('inspect_failed')
    else if (ctx.inspect.scheme !== 'none' || ctx.inspect.gpt?.primary?.present || ctx.inspect.gpt?.backup?.present) b.push('table_recoverable')
    return { blockers: [...new Set(b)], warnings: w, dataLoss }
  }

  if (req.op === 'create') {
    createChecks(req, disk, b)
    if (req.letter && ctx.usedLetters?.includes(req.letter)) b.push('letter_taken')
    w.push('create_two_steps')
    return { blockers: [...new Set(b)], warnings: w, dataLoss }
  }

  const p = disk.partitions.find((x) => x.number === req.partition)
  if (!p) return { blockers: [...new Set([...b, 'no_partition'])], warnings: w, dataLoss }
  b.push(...partitionBlockers(p, req, ctx))

  if (req.op === 'delete') {
    dataLoss = true
    if (p.offset === 0) b.push('no_table') // a stick with no partition table: Windows answers "Not Supported"
    if (p.role === 'basic' && p.volumePath && volumeInUse(p, ctx)) b.push('volume_in_use')
    if (p.role === 'linux') w.push('linux_partition')
    if (p.bitlocker === 'on' || p.bitlocker === 'unknown') w.push('bitlocker_delete')
    if (p.isLogical) w.push('logical_no_backup')
    w.push('delete_erases')
  } else if (req.op === 'format') {
    dataLoss = true
    if (!p.volumePath) b.push('no_volume')
    else if (volumeInUse(p, ctx)) b.push('volume_in_use')
    if (p.bitlocker !== 'off' && p.bitlocker !== 'none') b.push('bitlocker')
    if (FILE_SYSTEMS[req.fs].maxSize && p.size > FILE_SYSTEMS[req.fs].maxSize) b.push('fat32_too_big')
    w.push('format_erases')
  } else if (req.op === 'resize') {
    resizeChecks(req, p, disk, ctx, b)
    w.push('power_loss')
  } else if (req.op === 'letter') {
    if (!p.volumePath) b.push('no_volume')
    if (p.letter === req.letter) b.push('same_letter')
    else if (ctx.usedLetters?.includes(req.letter)) b.push('letter_taken')
    if (p.letter) w.push('letter_paths')
  }
  return { blockers: [...new Set(b)], warnings: w, dataLoss }
}

/** The disk as it should look afterwards. */
export function predict(req, disk) {
  let parts = disk.partitions.map((p) => ({ ...p }))
  const target = parts.find((p) => p.number === req.partition)
  if (req.op === 'create') {
    parts.push({ number: null, offset: req.offset, size: req.size, role: 'basic', letter: req.letter, fileSystem: req.fs, label: req.label })
  } else if (req.op === 'delete') {
    parts = parts.filter((p) => p !== target)
  } else if (req.op === 'resize' && target) {
    target.size = req.newSize
    target.free = null
  } else if (req.op === 'format' && target) {
    target.fileSystem = req.fs
    target.label = req.label
    target.free = null
  } else if (req.op === 'letter' && target) {
    target.letter = req.letter
  }
  parts.sort((a, b) => a.offset - b.offset)
  const style = req.op === 'init' ? 'GPT' : disk.style
  return { ...disk, style, partitions: parts, free: freeGaps(parts, disk.size, style) }
}

/** Differences between what was predicted and what the disk shows now. Empty means the operation did what it said. */
export function verify(req, expected, actual) {
  if (req.op === 'init') return actual.style === 'GPT' ? [] : ['style']
  const out = []
  const at = (list, offset) => list.find((p) => Math.abs(p.offset - offset) < TOLERANCE)
  for (const want of expected.partitions) {
    const got = at(actual.partitions, want.offset)
    if (!got) { out.push(`missing:${want.offset}`); continue }
    if (Math.abs(got.size - want.size) >= TOLERANCE) out.push(`size:${want.offset}`)
    const changed = want.number === null || want.number === req.partition
    if (changed && req.op !== 'delete') {
      if (want.fileSystem && got.fileSystem !== want.fileSystem) out.push(`fs:${want.offset}`)
      if (want.letter && got.letter !== want.letter) out.push(`letter:${want.offset}`)
    }
  }
  for (const got of actual.partitions) if (!at(expected.partitions, got.offset)) out.push(`extra:${got.offset}`)
  return out
}
