// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { PartitionService, partitionRole, bitlockerState, freeGaps, shapeListing, LIST_SCRIPT, MIN_FREE_BYTES } from '../electron/services/recovery/PartitionService.js'

const MIB = 1024 ** 2
const VOL = '\\\\?\\Volume{60ecb25e-1cf3-44f4-8df3-61bca80c9ecd}\\'
const BASIC = '{ebd0a0a2-b9e5-4433-87c0-68b6b72699c7}'

const raw = (over: Record<string, unknown> = {}) => ({
  elevated: true, systemDrive: 'C', encryptionRead: true, pagefiles: ['E'],
  encryption: [{ path: VOL.toUpperCase(), protection: 0, conversion: 1 }],
  disks: [
    { number: 2, name: ' USB Disk ', style: 'GPT', size: 1000 * MIB, sectorSize: 512 },
    { number: 1, name: 'NVMe', style: 'GPT', size: 2000 * MIB, sectorSize: 512, isBoot: true }
  ],
  partitions: [
    { disk: 2, number: 1, offset: MIB, size: 500 * MIB, letter: 'E', gptType: BASIC, accessPaths: ['E:\\', VOL] },
    { disk: 1, number: 2, offset: MIB, size: 1000 * MIB, letter: 'C', gptType: BASIC, accessPaths: ['C:\\'], isBoot: true }
  ],
  volumes: [{ path: VOL, fs: 'NTFS', label: 'Dados', free: 10 * MIB }],
  ...over
})

describe('partition listing', () => {
  it('names partition roles, and treats anything unrecognised as unknown', () => {
    expect(partitionRole({ gptType: '{C12A7328-F81F-11D2-BA4B-00A0C93EC93B}' })).toBe('esp')
    expect(partitionRole({ gptType: BASIC })).toBe('basic')
    expect(partitionRole({ gptType: '{00000000-0000-0000-0000-000000000001}' })).toBe('unknown')
    expect(partitionRole({ mbrType: 7 })).toBe('basic')
    expect(partitionRole({ mbrType: 15 })).toBe('extended')
    expect(partitionRole({})).toBe('unknown')
  })

  it('counts a suspended BitLocker volume as encrypted, and no data as unknown', () => {
    expect(bitlockerState({ protection: 0, conversion: 0 })).toBe('off')
    expect(bitlockerState({ protection: 0, conversion: 1 })).toBe('on')
    expect(bitlockerState({ protection: 1, conversion: 0 })).toBe('on')
    expect(bitlockerState(undefined)).toBe('unknown')
  })

  it('finds free gaps and drops alignment leftovers', () => {
    const parts = [{ offset: MIB, size: 100 * MIB }, { offset: 300 * MIB, size: 100 * MIB }]
    expect(freeGaps(parts, 1000 * MIB, 'GPT')).toEqual([
      { offset: 101 * MIB, size: 199 * MIB },
      { offset: 400 * MIB, size: 599 * MIB }
    ])
    expect(freeGaps([{ offset: MIB, size: 999 * MIB - MIN_FREE_BYTES + MIB }], 1000 * MIB, 'GPT')).toEqual([])
    expect(freeGaps([], 1000 * MIB, 'MBR')).toEqual([{ offset: MIB, size: 999 * MIB }])
  })

  it('joins disks, partitions and volumes', () => {
    const { disks, elevated } = shapeListing(raw())
    expect(elevated).toBe(true)
    expect(disks.map((d: { number: number }) => d.number)).toEqual([1, 2])
    const [sys, usb] = disks
    expect(usb.name).toBe('USB Disk')
    expect(usb.partitions[0]).toMatchObject({ number: 1, letter: 'E', role: 'basic', fileSystem: 'NTFS', label: 'Dados', bitlocker: 'on', hasPagefile: true, isWindows: false })
    expect(usb.free).toHaveLength(1)
    expect(sys.isBoot).toBe(true)
    expect(sys.partitions[0]).toMatchObject({ isWindows: true, isBoot: true, bitlocker: 'none' })
  })

  it('reports BitLocker as unknown when it could not be read', () => {
    const { disks } = shapeListing(raw({ encryptionRead: false, encryption: [] }))
    expect(disks[1].partitions[0].bitlocker).toBe('unknown')
  })

  it('survives the single-object output of ConvertTo-Json', () => {
    const r = raw({ disks: { number: 2, name: 'One', style: 'RAW', size: 100 * MIB }, partitions: null, volumes: null, encryption: null, pagefiles: null })
    const { disks } = shapeListing(r)
    expect(disks).toHaveLength(1)
    expect(disks[0].partitions).toEqual([])
  })

  it('only reads: the listing script has no Storage verb that changes a disk', () => {
    expect(LIST_SCRIPT).not.toMatch(/\b(New|Remove|Resize|Format|Set|Clear|Initialize|Update|Add)-(Partition|Volume|Disk)\b/i)
  })

  it('reports PowerShell failures', async () => {
    const svc = new PartitionService({ powershell: async () => ({ code: 1, stdout: '', stderr: 'sem acesso' }) })
    expect(await svc.list()).toEqual({ ok: false, error: 'sem acesso' })
  })

  it('returns the shaped listing', async () => {
    const svc = new PartitionService({ powershell: async () => ({ code: 0, stdout: JSON.stringify(raw()), stderr: '' }) })
    const r = await svc.list()
    expect(r.ok).toBe(true)
    expect(r.disks).toHaveLength(2)
  })
})
