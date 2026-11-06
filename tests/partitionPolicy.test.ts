// @vitest-environment node
// Fakes only: nothing here reaches PowerShell, the engine or a disk.
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
// @ts-ignore - plain JS module
import { normalizeRequest, evaluate, predict, verify, FILE_SYSTEMS } from '../electron/services/recovery/partitionPolicy.js'
// @ts-ignore - plain JS module
import { PartitionService, withRawBitlocker, fingerprint } from '../electron/services/recovery/PartitionService.js'

const MIB = 1024 ** 2
const GIB = 1024 ** 3
const VOL = '\\\\?\\Volume{aaaa}\\'
const part = (over = {}) => ({
  number: 1, offset: MIB, size: 10 * GIB, guid: '{p}', role: 'basic', letter: 'E', mountPaths: [], isBoot: false, isSystem: false, isActive: false, isHidden: false,
  isLogical: false, fileSystem: 'NTFS', label: 'Dados', free: GIB, volumePath: VOL, bitlocker: 'off', hasPagefile: false, isWindows: false, ...over
})
const disk = (over: Record<string, unknown> = {}) => ({
  number: 2, name: 'USB Disk', serial: 'S1', uniqueId: 'U', guid: '{d}', bus: 'USB', style: 'GPT', size: 100 * GIB, sectorSize: 512, isBoot: false, isSystem: false,
  isOffline: false, isReadOnly: false, isClustered: false, partitions: [part()], free: [{ offset: MIB + 10 * GIB, size: 80 * GIB }], ...over
})
const ctx = (over = {}) => ({
  elevated: true, jobBusy: false, engineSystem: [0, 1], appLetters: ['C'], usedLetters: ['C', 'E'], inspect: { scheme: 'gpt', gpt: {} },
  locks: new Map([[VOL.toLowerCase(), true]]), limits: { min: GIB, max: 90 * GIB }, ...over
})
const del = { op: 'delete', disk: 2, partition: 1 }
const blockers = (req: object, d = disk(), c = ctx()) => evaluate(req, d, c).blockers

describe('request validation', () => {
  it('keeps only the fields of the operation', () => {
    expect(normalizeRequest({ op: 'delete', disk: 2, partition: 1, offset: 5, evil: 'x' })).toEqual(del)
  })
  it.each([
    [{ op: 'wipe', disk: 2 }], [{ op: 'delete', disk: -1, partition: 1 }], [{ op: 'delete', disk: '2; rm', partition: 1 }], [{ op: 'delete', disk: 2 }],
    [{ op: 'letter', disk: 2, partition: 1, letter: 'C' }], [{ op: 'letter', disk: 2, partition: 1, letter: 'AB' }],
    [{ op: 'format', disk: 2, partition: 1, fs: 'ext4' }], [{ op: 'format', disk: 2, partition: 1, fs: 'constructor' }],
    [{ op: 'format', disk: 2, partition: 1, fs: 'NTFS', label: 'a"; Remove-Item' }], [{ op: 'format', disk: 2, partition: 1, fs: 'FAT32', label: '123456789012' }],
    [{ op: 'create', disk: 2, offset: 100, size: GIB, fs: 'NTFS' }], [{ op: 'resize', disk: 2, partition: 1, newSize: 1.5 }]
  ])('refuses %j', (r) => { expect(() => normalizeRequest(r)).toThrow() })
  it('knows the label limits', () => { expect(FILE_SYSTEMS.NTFS.maxLabel).toBe(32) })
})

describe('disk blockers', () => {
  it('allows a clean external disk', () => { expect(blockers(del)).toEqual([]) })
  it.each([
    ['system_disk', disk({ isBoot: true })], ['system_disk', disk({ isSystem: true })], ['system_disk', disk({ number: 1 })],
    ['system_disk', disk({ partitions: [part({ isWindows: true })] })], ['disk_offline', disk({ isOffline: true })],
    ['disk_readonly', disk({ isReadOnly: true })], ['disk_clustered', disk({ isClustered: true })], ['disk_unnamed', disk({ name: '' })],
    ['efi_disk', disk({ partitions: [part(), part({ number: 2, offset: 20 * GIB, role: 'esp' })] })],
    ['unsupported_disk', disk({ partitions: [part({ role: 'dynamic' })] })], ['unsupported_disk', disk({ partitions: [part({ role: 'spaces' })] })]
  ])('%s', (code, d) => { expect(blockers(del, d as ReturnType<typeof disk>)).toContain(code) })

  it('blocks every operation on a disk with an EFI partition, even on its data partitions', () => {
    const d = disk({ partitions: [part({ number: 1, role: 'esp', letter: null }), part({ number: 2, offset: 11 * GIB })] })
    for (const r of [{ op: 'delete', disk: 2, partition: 2 }, { op: 'format', disk: 2, partition: 2, fs: 'NTFS', label: '' }, { op: 'letter', disk: 2, partition: 2, letter: 'Z' }]) {
      expect(blockers(r, d)).toContain('efi_disk')
    }
  })
  it('fails closed without the engine, without admin, and during a job', () => {
    expect(blockers(del, disk(), ctx({ engineSystem: null }))).toContain('engine_unavailable')
    expect(blockers(del, disk(), ctx({ elevated: false }))).toContain('not_elevated')
    expect(blockers(del, disk(), ctx({ jobBusy: true }))).toContain('job_running')
  })
})

describe('partition blockers', () => {
  it.each(['esp', 'msr', 'recovery', 'unknown', 'extended'])('protects %s partitions', (role) => {
    expect(blockers(del, disk({ partitions: [part({ role })] }))).toContain('protected_partition')
  })
  it('lets a Linux partition be deleted, with a warning, and nothing else', () => {
    const d = disk({ partitions: [part({ role: 'linux', volumePath: null, letter: null, bitlocker: 'none' })] })
    const r = evaluate(del, d, ctx())
    expect(r.blockers).toEqual([])
    expect(r.warnings).toContain('linux_partition')
    expect(blockers({ op: 'resize', disk: 2, partition: 1, newSize: 5 * GIB }, d)).toContain('protected_partition')
  })
  it('refuses the page file and the volume the app runs from', () => {
    expect(blockers(del, disk({ partitions: [part({ hasPagefile: true })] }))).toContain('pagefile')
    expect(blockers(del, disk(), ctx({ appLetters: ['E'] }))).toContain('app_volume')
  })
  it('counts a volume with no probe result as in use', () => {
    expect(blockers(del, disk(), ctx({ locks: new Map() }))).toContain('volume_in_use')
    expect(blockers(del, disk(), ctx({ locks: new Map([[VOL.toLowerCase(), false]]) }))).toContain('volume_in_use')
  })
  it('has nothing to delete on a drive with no partition table', () => {
    expect(blockers(del, disk({ partitions: [part({ offset: 0 })] }))).toContain('no_table')
  })
  it('reports a partition that no longer exists', () => {
    expect(blockers({ op: 'delete', disk: 2, partition: 9 })).toContain('no_partition')
  })
})

describe('BitLocker', () => {
  const format = { op: 'format', disk: 2, partition: 1, fs: 'NTFS', label: '' }
  const shrink = { op: 'resize', disk: 2, partition: 1, newSize: 5 * GIB }
  it.each(['on', 'unknown'])('state %s blocks format and resize but only warns on delete', (bitlocker) => {
    const d = disk({ partitions: [part({ bitlocker })] })
    expect(blockers(format, d)).toContain('bitlocker')
    expect(blockers(shrink, d)).toContain('bitlocker')
    const r = evaluate(del, d, ctx())
    expect(r.blockers).toEqual([])
    expect(r.warnings).toContain('bitlocker_delete')
  })
  it('trusts the first sector over an unreadable WMI', () => {
    const d = disk({ partitions: [part({ bitlocker: 'unknown' })] })
    expect(withRawBitlocker(d, { layout: [{ offset: MIB, fs: 'NTFS' }] }).partitions[0].bitlocker).toBe('off')
    expect(withRawBitlocker(d, { layout: [{ offset: MIB, fs: 'BitLocker' }] }).partitions[0].bitlocker).toBe('on')
    expect(withRawBitlocker(d, null).partitions[0].bitlocker).toBe('unknown')
    const off = disk({ partitions: [part({ bitlocker: 'off' })] })
    expect(withRawBitlocker(off, { layout: [{ offset: MIB, fs: 'BitLocker' }] }).partitions[0].bitlocker).toBe('on')
  })
})

describe('operation rules', () => {
  const free = MIB + 10 * GIB
  const create = (o = {}) => ({ op: 'create', disk: 2, offset: free, size: GIB, fs: 'NTFS', label: '', letter: null, ...o })
  it('creates only inside free space', () => {
    expect(blockers(create())).toEqual([])
    expect(blockers(create({ offset: MIB }))).toContain('outside_free_space')
    expect(blockers(create({ size: 81 * GIB }))).toContain('outside_free_space')
    expect(blockers(create({ size: 8 * MIB }))).toContain('too_small')
    expect(blockers(create({ fs: 'FAT32', size: 33 * GIB }))).toContain('fat32_too_big')
    expect(blockers(create({ letter: 'E' }))).toContain('letter_taken')
    expect(blockers(create(), disk({ style: 'RAW', partitions: [] }))).toContain('not_initialized')
  })
  it('keeps to the MBR limits', () => {
    const four = [1, 2, 3, 4].map((n) => part({ number: n, offset: n * GIB, size: MIB }))
    expect(blockers(create(), disk({ style: 'MBR', partitions: four, free: [{ offset: free, size: 80 * GIB }] }))).toContain('mbr_full')
    const big = disk({ style: 'MBR', size: 4096 * GIB, free: [{ offset: 2047 * GIB, size: 100 * GIB }] })
    expect(blockers(create({ offset: 2047 * GIB, size: 2 * GIB }), big)).toContain('mbr_limit')
  })
  it('resizes NTFS only, inside the limits', () => {
    const r = (n: number) => ({ op: 'resize', disk: 2, partition: 1, newSize: n })
    expect(blockers(r(5 * GIB))).toEqual([])
    expect(blockers(r(20 * GIB))).toEqual([])
    expect(blockers(r(GIB / 2))).toContain('below_minimum')
    expect(blockers(r(95 * GIB))).toContain('above_maximum')
    expect(blockers(r(10 * GIB))).toContain('same_size')
    expect(blockers(r(5 * GIB), disk(), ctx({ limits: null }))).toContain('limits_unknown')
    expect(blockers(r(5 * GIB), disk({ partitions: [part({ fileSystem: 'exFAT' })] }))).toContain('resize_ntfs_only')
    expect(blockers(r(20 * GIB), disk({ free: [] }))).toContain('no_space_after')
  })
  it('only extends into the space right after the partition', () => {
    const d = disk({ free: [{ offset: 50 * GIB, size: 40 * GIB }] })
    expect(blockers({ op: 'resize', disk: 2, partition: 1, newSize: 20 * GIB }, d)).toContain('no_space_after')
  })
  it('changes letters only to free ones', () => {
    const l = (x: string) => ({ op: 'letter', disk: 2, partition: 1, letter: x })
    expect(blockers(l('F'))).toEqual([])
    expect(blockers(l('C'))).toContain('letter_taken')
    expect(blockers(l('E'))).toContain('same_letter')
    expect(evaluate(l('F'), disk(), ctx()).warnings).toContain('letter_paths')
    expect(evaluate(l('F'), disk(), ctx()).dataLoss).toBe(false)
  })
  it('marks delete and format as data loss', () => {
    expect(evaluate(del, disk(), ctx()).dataLoss).toBe(true)
    expect(evaluate({ op: 'format', disk: 2, partition: 1, fs: 'exFAT', label: '' }, disk(), ctx()).dataLoss).toBe(true)
    expect(evaluate({ op: 'resize', disk: 2, partition: 1, newSize: 5 * GIB }, disk(), ctx()).dataLoss).toBe(false)
  })
  it('initialises only a truly blank disk', () => {
    const blank = disk({ style: 'RAW', partitions: [], free: [] })
    const init = { op: 'init', disk: 2 }
    expect(blockers(init, blank, ctx({ inspect: { scheme: 'none', gpt: { primary: { present: false }, backup: { present: false } } } }))).toEqual([])
    expect(blockers(init, disk())).toContain('already_initialized')
    expect(blockers(init, blank, ctx({ inspect: null }))).toContain('inspect_failed')
    expect(blockers(init, blank, ctx({ inspect: { scheme: 'none', gpt: { primary: { present: false }, backup: { present: true } } } }))).toContain('table_recoverable')
    expect(blockers(init, blank, ctx({ inspect: { scheme: 'mbr', gpt: {} } }))).toContain('table_recoverable')
  })
})

describe('prediction and verification', () => {
  it('predicts each operation', () => {
    expect(predict(del, disk()).partitions).toEqual([])
    expect(predict({ op: 'resize', disk: 2, partition: 1, newSize: 5 * GIB }, disk()).partitions[0].size).toBe(5 * GIB)
    expect(predict({ op: 'letter', disk: 2, partition: 1, letter: 'F' }, disk()).partitions[0].letter).toBe('F')
    const c = predict({ op: 'create', disk: 2, offset: 20 * GIB, size: GIB, fs: 'exFAT', label: 'X', letter: 'G' }, disk())
    expect(c.partitions).toHaveLength(2)
    expect(c.free).toHaveLength(2)
  })
  it('accepts small rounding and reports real differences', () => {
    const req = { op: 'resize', disk: 2, partition: 1, newSize: 5 * GIB }
    const want = predict(req, disk())
    expect(verify(req, want, disk({ partitions: [part({ size: 5 * GIB - MIB })] }))).toEqual([])
    expect(verify(req, want, disk())).toEqual([`size:${MIB}`])
    expect(verify(del, predict(del, disk()), disk())).toEqual([`extra:${MIB}`])
    const f = { op: 'format', disk: 2, partition: 1, fs: 'exFAT', label: '' }
    expect(verify(f, predict(f, disk()), disk())).toEqual([`fs:${MIB}`])
  })
})

/** PartitionService with every external call replaced. */
function harness(over: { disk?: object; script?: object; drives?: object; backup?: object; busy?: boolean; afterDisk?: object } = {}) {
  let current: object = over.disk ?? disk()
  const payloads: any[] = []
  const argLists: string[][] = []
  const listed = () => ({ code: 0, stderr: '', stdout: '' })
  const service = new PartitionService({
    scriptPath: 'C:\\x\\partition-ops.ps1',
    recovery: {
      run: vi.fn(async () => ({ ok: true, volumes: [{ volume: VOL.slice(0, -1), lockable: true }] })),
      listDrives: vi.fn(async () => over.drives ?? { ok: true, system_disks: [0, 1] }),
      inspectDisk: vi.fn(async () => ({ ok: true, scheme: 'gpt', gpt: {}, layout: [] })),
      status: () => ({ running: false }),
      reserve: vi.fn(() => !over.busy),
      release: vi.fn(),
      backupTable: vi.fn(async () => over.backup ?? { ok: true, out: 'C:\\b\\x.dhbk' })
    },
    powershell: listed,
    spawnImpl: (_exe: string, args: string[]) => {
      argLists.push(args)
      const payload = JSON.parse(Buffer.from(args[args.length - 1], 'base64').toString('utf8'))
      payloads.push(payload)
      const p: any = new EventEmitter()
      p.stdout = new EventEmitter(); p.stderr = new EventEmitter()
      const result = payload.op === 'limits' ? { ok: true, min: GIB, max: 90 * GIB } : over.script ?? { ok: true, written: true }
      if (payload.op !== 'limits' && over.afterDisk) current = over.afterDisk
      setTimeout(() => { p.stdout.emit('data', `noise\nDKPART|${JSON.stringify(result)}\n`); p.emit('close', 0) }, 1)
      return p
    }
  })
  service.list = async () => ({ ok: true, elevated: true, usedLetters: ['C', 'E'], disks: [current] })
  return { service, payloads, argLists, swap: (d: object) => { current = d } }
}
const writes = (payloads: any[]) => payloads.filter((p) => p.op !== 'limits')
const emptied = disk({ partitions: [], free: [{ offset: MIB, size: 99 * GIB }] })

describe('plan and apply', () => {
  it('settles an unknown BitLocker state from the first sector, and stays unknown if it cannot read', async () => {
    const stick = disk({ partitions: [part({ offset: 0, bitlocker: 'unknown' })] })
    const req = { op: 'format', disk: 2, partition: 1, fs: 'exFAT', label: '' }
    const { service } = harness({ disk: stick })
    service.recovery.readSector = vi.fn(async () => ({ ok: true, decoded: { oem_id: '' } }))
    expect((await service.plan(req)).blockers).toEqual([])
    service.recovery.readSector = vi.fn(async () => ({ ok: true, decoded: { oem_id: '-FVE-FS-' } }))
    expect((await service.plan(req)).blockers).toContain('bitlocker')
    service.recovery.readSector = vi.fn(async () => ({ ok: false }))
    expect((await service.plan(req)).blockers).toContain('bitlocker')
  })
  it('a blocked plan has no id and cannot run', async () => {
    const { service, payloads } = harness({ disk: disk({ isSystem: true }) })
    const plan = await service.plan(del)
    expect(plan).toMatchObject({ ok: true, planId: null })
    expect(plan.blockers).toContain('system_disk')
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'plan_expired' })
    expect(writes(payloads)).toEqual([])
  })
  it('planning writes nothing', async () => {
    const { service, payloads } = harness()
    await service.plan(del)
    expect(writes(payloads)).toEqual([])
  })
  it('needs the exact disk name, and the data-loss tick', async () => {
    const { service, payloads } = harness()
    let plan = await service.plan(del)
    expect(await service.apply({ planId: plan.planId, confirmName: 'usb disk', ack: true })).toMatchObject({ ok: false, code: 'confirm_name' })
    plan = await service.plan(del)
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk' })).toMatchObject({ ok: false, code: 'confirm_ack' })
    expect(writes(payloads)).toEqual([])
  })
  it('a plan runs once', async () => {
    const { service, payloads } = harness({ afterDisk: emptied })
    const plan = await service.plan(del)
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: true, backupFile: 'C:\\b\\x.dhbk' })
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'plan_expired' })
    expect(writes(payloads)).toHaveLength(1)
  })
  it('expires', async () => {
    const { service } = harness()
    let t = 0
    service.now = () => t
    const plan = await service.plan(del)
    t = 6 * 60 * 1000
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'plan_expired' })
  })
  it('refuses when the disk changed after the preview', async () => {
    const { service, payloads, swap } = harness()
    const plan = await service.plan(del)
    swap(disk({ serial: 'OTHER' }))
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'disk_changed' })
    expect(writes(payloads)).toEqual([])
  })
  it('tells two disks apart when the UniqueId is zeroed', () => {
    const a = fingerprint(disk({ uniqueId: '0000000000000000', serial: 'A' }))
    expect(a).not.toBe(fingerprint(disk({ uniqueId: '0000000000000000', serial: 'B' })))
  })
  it('re-runs the rules at apply time', async () => {
    const { service, payloads } = harness()
    const plan = await service.plan(del)
    service.recovery.run = vi.fn(async () => ({ ok: true, volumes: [{ volume: VOL.slice(0, -1), lockable: false }] }))
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'blocked', blockers: ['volume_in_use'] })
    expect(writes(payloads)).toEqual([])
  })
  it('does not write when the table backup fails', async () => {
    const { service, payloads } = harness({ backup: { ok: false, error: 'x' } })
    const plan = await service.plan(del)
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'backup_failed' })
    expect(writes(payloads)).toEqual([])
  })
  it('does not run beside an engine job, and always frees the slot', async () => {
    const busy = harness({ busy: true })
    const plan = await busy.service.plan(del)
    expect(await busy.service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'job_running' })
    const free = harness({ afterDisk: emptied })
    const p2 = await free.service.plan(del)
    await free.service.apply({ planId: p2.planId, confirmName: 'USB Disk', ack: true })
    expect(free.service.recovery.release).toHaveBeenCalledWith('partition')
    expect(free.service.running).toBe(false)
  })
  it('reports a write that the re-read does not confirm', async () => {
    const { service } = harness()
    const plan = await service.plan(del)
    expect(await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })).toMatchObject({ ok: false, code: 'verify_failed', written: true })
  })
  it('sends the user text only inside base64, as one argument of a fixed list', async () => {
    const label = 'a b'
    const { service, argLists, payloads } = harness({ afterDisk: disk({ partitions: [part({ fileSystem: 'exFAT', label })] }) })
    const plan = await service.plan({ op: 'format', disk: 2, partition: 1, fs: 'exFAT', label })
    await service.apply({ planId: plan.planId, confirmName: 'USB Disk', ack: true })
    expect(argLists[0].slice(0, 7)).toEqual(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\x\\partition-ops.ps1', '-Payload'])
    expect(argLists[0][7]).toMatch(/^[A-Za-z0-9+/=]+$/)
    expect(payloads[0]).toMatchObject({ op: 'format', fs: 'exFAT', label, disk: { name: 'USB Disk', serial: 'S1' }, layout: [{ number: 1, offset: MIB }] })
  })
})
