// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  default: { app: { getPath: () => '/tmp/dh-test', isPackaged: false } },
  app: { getPath: () => '/tmp/dh-test', isPackaged: false }
}))

// @ts-ignore plain JS modules
import { StorageEngine } from '../electron/services/optimizer/StorageEngine.js'
// @ts-ignore plain JS module
import { CleanerService } from '../electron/services/cleaner/CleanerService.js'

const EXE = path.resolve(__dirname, '../electron/services/DarkHub.Cleaner.exe')

/** A fake engine: 2 items / 5000 bytes in the bin, emptied on apply. Never touches the real Recycle Bin. */
function fakeCleaner(calls: any[]) {
  return {
    recycleBin: vi.fn(async ({ apply = false } = {}) => {
      calls.push(apply)
      return { ok: true, before: { items: 2, bytes: 5000 }, files: apply ? 2 : 2, bytes: 5000, locked: 0 }
    })
  }
}

function engineWithTemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-storage-'))
  fs.writeFileSync(path.join(dir, 'a.tmp'), Buffer.alloc(100))
  const e = new StorageEngine()
  e.tempDirs = [dir]
  return { e, dir }
}

describe('Recycle Bin in the temp clean', () => {
  it('is left alone unless the caller asks for it (maintenance, Hub, privacy clean)', async () => {
    const { e } = engineWithTemp()
    const calls: any[] = []
    e.cleaner = fakeCleaner(calls)
    const r = await e.cleanTempFiles()
    expect(calls).toEqual([])
    expect(r.recycleBin).toBeNull()
    expect(r.freedBytes).toBe(100)
  })

  it('is emptied and measured when the user clicked', async () => {
    const { e } = engineWithTemp()
    const calls: any[] = []
    e.cleaner = fakeCleaner(calls)
    const r = await e.cleanTempFiles({ recycleBin: true })
    expect(calls).toEqual([true])
    expect(r.recycleBin).toEqual({ items: 2, bytes: 5000, left: 0 })
    expect(r.freedBytes).toBe(5100)
    expect(r.msg).toMatch(/Lixeira esvaziada: 2 item/)
  })

  it('a failure to empty the bin is reported without failing the temp clean', async () => {
    const { e } = engineWithTemp()
    e.cleaner = { recycleBin: async () => ({ ok: false, error: 'negado' }) }
    const r = await e.cleanTempFiles({ recycleBin: true })
    expect(r.ok).toBe(true)
    expect(r.msg).toMatch(/Lixeira não esvaziada: negado/)
  })

  it('the dashboard estimate counts what is in the bin', async () => {
    const { e } = engineWithTemp()
    const calls: any[] = []
    e.cleaner = fakeCleaner(calls)
    const r = await e.analyzeTempFiles({ recycleBin: true })
    expect(calls).toEqual([false])
    expect(r.summary).toMatchObject({ bytes: 5100, files: 3, recycleBin: { items: 2, bytes: 5000 } })
  })

  it('the Optimizer item includes the bin from its screen, not from a Hub package', async () => {
    const engine = (await import('../electron/services/optimizer/StorageEngine.js')).default as any
    const spy = vi.spyOn(engine, 'cleanTempFiles').mockResolvedValue({ ok: true, status: 'Success', freedBytes: 0, msg: 'x' })
    const svc = (await import('../electron/services/optimizer/SystemOptimizerService.js')).default as any
    const op = svc.operations.get('optimizer:cleanTemp')
    await op.execute(() => {})
    await op.execute()
    expect(spy.mock.calls.map((c: any[]) => c[0])).toEqual([{ recycleBin: true }, { recycleBin: false }])
    spy.mockRestore()
  })
})

describe.skipIf(!(fs.existsSync(EXE) && process.platform === 'win32'))('Recycle Bin engine command (read-only)', () => {
  it('measures the bin and refuses to touch it in test mode', async () => {
    const svc = new CleanerService({ exePath: EXE, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'dh-rb-')) })
    const r = await svc.recycleBin()
    expect(r).toMatchObject({ ok: true, dry_run: true, id: 'dh:recycle-bin' })
    expect(typeof r.before.bytes).toBe('number')
    const guarded = new CleanerService({ exePath: EXE, dataDir: os.tmpdir(), extraArgs: ['--test-root', os.tmpdir()] })
    expect(await guarded.recycleBin({ apply: true })).toMatchObject({ ok: false, code: 'bad_args' })
  })
})
