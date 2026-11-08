import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import PartitionManager from '../src/components/recovery/PartitionManager'
import { alignGap, freeLetters, layoutOf } from '../src/components/recovery/partitionLayout'
import type { PartitionDisk, PartitionEntry } from '../src/global'

const MIB = 1024 ** 2
const part = (over: Partial<PartitionEntry>): PartitionEntry => ({
  number: 1, offset: MIB, size: 100 * MIB, role: 'basic', letter: 'E', mountPaths: [], isBoot: false, isSystem: false, isActive: false,
  isHidden: false, fileSystem: 'NTFS', label: 'Dados', free: 10 * MIB, volumePath: null, bitlocker: 'off', hasPagefile: false, isWindows: false, ...over
})
const disk = (over: Partial<PartitionDisk> = {}): PartitionDisk => ({
  number: 2, name: 'USB Disk', serial: 'S', uniqueId: 'U', bus: 'USB', style: 'GPT', size: 1000 * MIB, sectorSize: 512, isBoot: false, isSystem: false,
  isOffline: false, isReadOnly: false, isClustered: false, partitions: [part({})], free: [{ offset: 101 * MIB, size: 898 * MIB }], ...over
})
const mount = (disks: PartitionDisk[], diskNumber: number | null = 2, elevated = true) => {
  ;(window as any).darkhub = { recovery: { partitionList: vi.fn(async () => ({ ok: true, elevated, usedLetters: ['C', 'E'], disks })) } }
  return render(<I18nProvider><PartitionManager diskNumber={diskNumber} /></I18nProvider>)
}

describe('Partition tab', () => {
  beforeEach(() => { cleanup() })

  it('orders partitions and free space on the map', () => {
    const items = layoutOf(disk())
    expect(items.map((i) => i.kind)).toEqual(['ntfs', 'unallocated'])
    expect(items[0]).toMatchObject({ index: 1, start_lba: 2048, label: 'E:' })
  })

  it('lists the partitions of the chosen disk', async () => {
    mount([disk()])
    expect(await screen.findByText('NTFS')).toBeTruthy()
    expect(screen.getByText('USB Disk')).toBeTruthy()
  })

  it('warns that a system disk stays read-only', async () => {
    mount([disk({ isSystem: true })])
    expect(await screen.findByText(/read-only|só para leitura/)).toBeTruthy()
  })

  it('explains why BitLocker is unknown without administrator rights', async () => {
    mount([disk({ partitions: [part({ bitlocker: 'unknown' })] })], 2, false)
    expect(await screen.findByText(/BitLocker (state|não)|estado do BitLocker/)).toBeTruthy()
  })

  it('refuses image files', () => {
    mount([], null)
    expect(screen.getByText(/image files|arquivos de imagem/)).toBeTruthy()
  })
})

const plan = (over = {}) => ({ ok: true, planId: 'p1', op: 'delete', diskName: 'USB Disk', before: disk(), after: disk({ partitions: [] }), blockers: [], warnings: ['delete_erases'], dataLoss: true, limits: null, ...over })

describe('Partition actions', () => {
  beforeEach(() => { cleanup() })
  const open = async (r: ReturnType<typeof plan>, applyResult: object = { ok: true, backupFile: 'C:\b.dhbk' }, d = disk()) => {
    mount([d])
    const rec = (window as any).darkhub.recovery
    rec.partitionPlan = vi.fn(async () => r)
    rec.partitionApply = vi.fn(async () => applyResult)
    fireEvent.click((await screen.findAllByText('NTFS'))[0])
    fireEvent.click(screen.getByRole('button', { name: /^(Excluir|Delete)$/ }))
    await screen.findByRole('dialog')
    return rec
  }
  const run = () => screen.queryByRole('button', { name: /Executar no disco|Run on the disk/ }) as HTMLButtonElement | null

  it('offers no operation on a disk with an EFI partition', async () => {
    mount([disk({ partitions: [part({}), part({ number: 2, offset: 200 * MIB, role: 'esp' })] })])
    fireEvent.click((await screen.findAllByText('NTFS'))[0])
    expect(screen.queryByRole('button', { name: /^(Excluir|Delete)$/ })).toBeNull()
  })

  it('needs the exact name and the data-loss tick before it can run', async () => {
    const rec = await open(plan())
    expect(rec.partitionPlan).toHaveBeenCalledWith({ op: 'delete', disk: 2, partition: 1 })
    expect(run()!.disabled).toBe(true)
    const input = screen.getByRole('textbox', { name: /(nome do disco|disk name)/ })
    fireEvent.change(input, { target: { value: 'usb disk' } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(run()!.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'USB Disk' } })
    expect(run()!.disabled).toBe(false)
    fireEvent.click(run()!)
    await waitFor(() => expect(rec.partitionApply).toHaveBeenCalledWith({ planId: 'p1', confirmName: 'USB Disk', ack: true }))
    expect(await screen.findByText(/\.dhbk/)).toBeTruthy()
  })

  it('stops saying nothing changed once the operation ran', async () => {
    await open(plan())
    expect(screen.getByText(/Nothing has changed yet|Nada foi alterado ainda/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: /(nome do disco|disk name)/ }), { target: { value: 'USB Disk' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(run()!)
    await screen.findByText(/\.dhbk/)
    expect(screen.queryByText(/Nothing has changed yet|Nada foi alterado ainda/)).toBeNull()
  })

  it('reads the disks again when the page asks for a reload', async () => {
    const view = mount([disk()])
    await screen.findAllByText('NTFS')
    const list = (window as any).darkhub.recovery.partitionList
    const calls = list.mock.calls.length
    view.rerender(<I18nProvider><PartitionManager diskNumber={2} reloadKey={1} /></I18nProvider>)
    await waitFor(() => expect(list.mock.calls.length).toBe(calls + 1))
  })

  it('a refused plan shows why and has no way to run', async () => {
    await open(plan({ planId: null, blockers: ['volume_in_use'] }))
    expect(screen.getByRole('alert').textContent).toMatch(/in use|em uso/)
    expect(run()).toBeNull()
    expect(screen.queryByRole('textbox', { name: /(nome do disco|disk name)/ })).toBeNull()
  })

  it('shows a failure in words, not as a code', async () => {
    await open(plan(), { ok: false, code: 'disk_changed' })
    fireEvent.change(screen.getByRole('textbox', { name: /(nome do disco|disk name)/ }), { target: { value: 'USB Disk' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(run()!)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was written|Nada foi gravado/)
  })

  it('offers GPT only on a blank disk', async () => {
    mount([disk({ style: 'RAW', partitions: [], free: [] })])
    expect(await screen.findByRole('button', { name: /GPT/ })).toBeTruthy()
  })

  it('trims gaps to whole MiB and lists free letters from D', () => {
    expect(alignGap({ offset: MIB + 5, size: 10 * MIB })).toEqual({ offset: 2 * MIB, size: 9 * MIB })
    expect(freeLetters(['D', 'E']).slice(0, 2)).toEqual(['F', 'G'])
  })
})

describe('Partition messages', () => {
  it('has words for every blocker, warning and error, in both languages', async () => {
    const { recoveryMessages } = await import('../src/i18n/recoveryMessages')
    const fs = await import('node:fs')
    const code = ['electron/services/recovery/partitionPolicy.js', 'electron/services/recovery/PartitionService.js', 'electron/services/recovery/partition-ops.ps1'].map((f) => fs.readFileSync(f, 'utf8')).join(' ')
    const policy = fs.readFileSync('electron/services/recovery/partitionPolicy.js', 'utf8')
    const blockers = [...policy.matchAll(/(?:b\.push|\[\.\.\.b, )\('?([a-z_0-9]+)'/g)].map((m) => m[1])
    const warnings = [...policy.matchAll(/w\.push\('([a-z_]+)'\)/g)].map((m) => m[1])
    const errors = [...code.matchAll(/code: '([a-z_]+)'|Stop-Refused '([a-z_]+)'/g)].map((m) => m[1] ?? m[2]).filter((c) => c !== 'no_disk' && c !== 'bad_op')
    expect(blockers.length).toBeGreaterThan(20)
    for (const lang of ['pt-BR', 'en-US'] as const) {
      for (const b of blockers) expect(recoveryMessages[lang], b).toHaveProperty([`rescue.part.block.${b}`])
      for (const w of warnings) expect(recoveryMessages[lang], w).toHaveProperty([`rescue.part.warn.${w}`])
      for (const e of errors) expect(recoveryMessages[lang], e).toHaveProperty([`rescue.part.err.${e}`])
    }
  })
})
