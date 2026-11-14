// @vitest-environment node
// Dashboard "Lixo (estimado)" + clean: both must read the same folders, and a clean must make the estimate drop.
import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import StorageEngine from '../electron/services/optimizer/StorageEngine.js'

const realDirs = StorageEngine.tempDirs
const made: string[] = []
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-junk-'))
  made.push(root)
  fs.writeFileSync(path.join(root, 'a.tmp'), Buffer.alloc(1000))
  fs.mkdirSync(path.join(root, 'setup-123', 'deep'), { recursive: true })
  fs.writeFileSync(path.join(root, 'setup-123', 'deep', 'b.log'), Buffer.alloc(2000))
  fs.mkdirSync(path.join(root, 'NVIDIA'))
  fs.writeFileSync(path.join(root, 'NVIDIA', 'shader.bin'), Buffer.alloc(500))
  StorageEngine.tempDirs = [root]
  return root
}
afterEach(() => {
  StorageEngine.tempDirs = realDirs
  for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('temp cleanup', () => {
  it('estimates exactly what the clean removes, then nothing', async () => {
    const root = fixture()
    const before = await StorageEngine.analyzeTempFiles()
    expect(before.summary).toMatchObject({ files: 2, bytes: 3000, truncated: false })

    const r = await StorageEngine.cleanTempFiles()
    expect(r).toMatchObject({ ok: true, processedItems: 2, freedBytes: 3000, lockedFiles: 0 })
    expect(fs.existsSync(path.join(root, 'a.tmp'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'setup-123'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'NVIDIA', 'shader.bin'))).toBe(true)
    expect(fs.existsSync(root)).toBe(true)

    const after = await StorageEngine.analyzeTempFiles()
    expect(after.summary).toMatchObject({ files: 0, bytes: 0 })
  })

  it('removes read-only files', async () => {
    const root = fixture()
    const held = path.join(root, 'held.tmp')
    fs.writeFileSync(held, Buffer.alloc(100))
    fs.chmodSync(held, 0o444) // read-only: unlink fails on Windows
    const r = await StorageEngine.cleanTempFiles()
    expect(fs.existsSync(held)).toBe(false) // read-only temp files (installers leave many) are removed too
    expect(r).toMatchObject({ processedItems: 3, lockedFiles: 0 })
  })

  it('marks an estimate that ran out of time as a lower bound', async () => {
    fixture()
    let clock = 0
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => (clock += 1000))
    try {
      const r = await StorageEngine.analyzeTempFiles({ deadlineMs: 1500 })
      expect(r.summary.truncated).toBe(true)
    } finally { spy.mockRestore() }
    expect((await StorageEngine.analyzeTempFiles()).summary.truncated).toBe(false)
  })

  it('never follows a junction out of the temp folder', async () => {
    const root = fixture()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-outside-'))
    made.push(outside)
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'x')
    try { fs.symlinkSync(outside, path.join(root, 'link'), 'junction') } catch { return }
    await StorageEngine.cleanTempFiles()
    expect(fs.existsSync(path.join(outside, 'keep.txt'))).toBe(true)
  })
})

describe('dashboard estimate wiring', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.js'), 'utf8')
  it('reads the cleaner folders and drops its cache after a clean', () => {
    // the estimate and the Dashboard clean both include the Recycle Bin, so they cannot disagree
    expect(main).toMatch(/StorageEngine\.analyzeTempFiles\(\{ deadlineMs: timeoutMs, recycleBin: true \}\)/)
    expect(main).not.toMatch(/app\.getPath\('cache'\)/)
    const clean = main.slice(main.indexOf("case 'clean-temp': {"), main.indexOf("case 'repair-windows'"))
    expect(clean).toMatch(/StorageEngine\.cleanTempFiles\(\{ recycleBin: process\.platform === 'win32' \}\)/)
    expect(clean).toMatch(/junkEstimateCache = \{ ts: 0, result: null, inFlight: null \}/)
  })
})

describe('dashboard activity', () => {
  it('stamps entries pushed without a time', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/hooks/useRecentActivity.ts'), 'utf8')
    expect(src).toMatch(/Number\.isFinite\(entry\.timestamp\) \? Number\(entry\.timestamp\) : Date\.now\(\)/)
  })
})
