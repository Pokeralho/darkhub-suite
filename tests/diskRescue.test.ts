// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { DiskRecoveryService, normalizeTarget, createLineParser } from '../electron/services/recovery/DiskRecoveryService.js'

const EXE = path.resolve(__dirname, '../electron/services/DarkHub.DiskRescue.exe')
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-rescue-'))

function fakeSpawn(lines: string[], record: { args?: string[]; stdin: string[] }) {
  return (_exe: string, args: string[]) => {
    record.args = args
    const proc: any = new EventEmitter()
    proc.stdout = new EventEmitter(); proc.stdout.setEncoding = () => {}
    proc.stderr = new EventEmitter()
    proc.stdin = { write: (s: string) => { record.stdin.push(s) } }
    proc.kill = () => proc.emit('close', null)
    setTimeout(() => {
      // Split a line across chunks to exercise the parser.
      const text = lines.join('\n') + '\n'
      proc.stdout.emit('data', text.slice(0, 7)); proc.stdout.emit('data', text.slice(7))
      proc.emit('close', 0)
    }, 5)
    return proc
  }
}

describe('Disk Rescue service', () => {
  it('accepts only disks and absolute image paths', () => {
    expect(normalizeTarget('disk:2')).toBe('disk:2')
    expect(normalizeTarget('\\\\.\\PhysicalDrive3')).toBe('disk:3')
    expect(normalizeTarget('C:\\imgs\\a.img')).toBe('C:\\imgs\\a.img')
    expect(() => normalizeTarget('relative.img')).toThrow()
    expect(() => normalizeTarget('--confirm-disk')).toThrow()
    expect(() => normalizeTarget('')).toThrow()
  })

  it('parses NDJSON split across chunks and skips non-JSON lines', () => {
    const out: any[] = []
    const p = createLineParser((o: any) => out.push(o))
    p.push('{"a":1}\nnoise\n{"b"'); p.push(':2}\n{"c":3}'); p.end()
    expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })

  it('writes are dry-run unless applied, and a disk needs its number typed', () => {
    const svc = new DiskRecoveryService({ exePath: EXE, backupDir: tmpDir() })
    expect(svc._writeFlags('disk:2', {})).toEqual(['--dry-run'])
    expect(() => svc._writeFlags('disk:2', { apply: true })).toThrow(/2/)
    expect(() => svc._writeFlags('disk:2', { apply: true, confirmDisk: 3 })).toThrow()
    const ok = svc._writeFlags('disk:2', { apply: true, confirmDisk: 2 })
    expect(ok).toContain('--confirm-disk')
    expect(ok[ok.indexOf('--backup') + 1]).toMatch(/disco2-backup-.*\.dhbk$/)
    expect(() => svc.clone({ source: 'disk:0', target: 'disk:2', apply: true, confirmDisk: 1 })).toThrow()
    expect(() => svc.clone({ source: 'disk:2', target: 'disk:2' })).toThrow()
  })

  it('streams progress events, resolves with the done line and sends cancel on stdin', async () => {
    const rec = { stdin: [] as string[] }
    const svc = new DiskRecoveryService({ exePath: process.execPath, spawnImpl: fakeSpawn([
      '{"event":"progress","phase":"carve","bytes":5,"total":10,"percent":50}',
      '{"event":"found","file":{"type":"jpg","offset":4096}}',
      '{"event":"done","ok":true,"total_files":1}'
    ], rec) })
    const events: any[] = []
    const p = svc.startCarving({ target: 'disk:4', out: 'E:\\rec', types: ['jpg', 'evil;rm'] }, (e: any) => events.push(e))
    expect(svc.status().running).toBe(true)
    expect(await svc.stream('x', [])).toMatchObject({ ok: false, code: 'busy' })
    svc.cancel()
    const r = await p
    expect(rec.stdin).toEqual(['cancel\n'])
    expect(rec.args).toEqual(['carve', 'disk:4', '--out', 'E:\\rec', '--types', 'jpg'])
    expect(events.map((e) => e.event)).toEqual(['progress', 'found'])
    expect(events[0].kind).toBe('carve')
    expect(r).toMatchObject({ ok: true, event: 'done', total_files: 1 })
    expect(svc.status().running).toBe(false)
  })

  it.runIf(process.platform === 'win32' && fs.existsSync(EXE))('drives the real engine against a synthetic image', async () => {
    const dir = tmpDir()
    const img = path.join(dir, 'disk.raw')
    const buf = Buffer.alloc(4 << 20)
    // MBR with one NTFS partition at LBA 2048 (the usual 1 MiB alignment), 4096 sectors.
    buf[446 + 4] = 0x07; buf.writeUInt32LE(2048, 446 + 8); buf.writeUInt32LE(4096, 446 + 12); buf[510] = 0x55; buf[511] = 0xaa
    const vbr = 2048 * 512
    buf.write('NTFS    ', vbr + 3, 'latin1'); buf.writeUInt16LE(512, vbr + 11); buf.writeUInt32LE(2048, vbr + 0x1c)
    buf.writeBigUInt64LE(4095n, vbr + 0x28); buf[vbr + 510] = 0x55; buf[vbr + 511] = 0xaa
    fs.writeFileSync(img, buf)
    const svc = new DiskRecoveryService({ exePath: EXE, backupDir: dir })

    const info = await svc.inspectDisk({ target: img })
    expect(info.ok).toBe(true)
    expect(info.scheme).toBe('mbr')
    expect(info.layout.find((p: any) => p.fs === 'NTFS')).toMatchObject({ start_lba: 2048, sectors: 4096, kind: 'ntfs' })

    const s = await svc.readSector({ target: img, lba: -1 })
    expect(s).toMatchObject({ ok: true, lba: 8191, sector_size: 512 })
    expect(s.rows).toHaveLength(32)

    // Wipe the MBR, then find the volume again and rebuild it (dry run first, then applied on the image).
    fs.writeFileSync(img, Buffer.concat([Buffer.alloc(512), buf.subarray(512)]))
    const plan = await svc.repairHeader({ target: img, mode: 'mbr' })
    expect(plan.ok).toBe(true)
    expect(plan.dry_run).toBe(true)
    expect(plan.volumes[0]).toMatchObject({ fs: 'NTFS', start_lba: 2048 })
    const applied = await svc.repairHeader({ target: img, mode: 'mbr', apply: true })
    expect(applied.ok).toBe(true)
    expect(fs.existsSync(applied.result.backup_file)).toBe(true)
    const again = await svc.inspectDisk({ target: img })
    expect(again.layout.find((p: any) => p.fs === 'NTFS')).toBeTruthy()

    // Image → new image with verification.
    const copy = path.join(dir, 'copy.img')
    const c = await svc.clone({ source: img, target: copy, createImage: true, verify: true, apply: true })
    expect(c).toMatchObject({ ok: true, verified: true, bytes: 4 << 20 })
    expect(fs.readFileSync(copy).equals(fs.readFileSync(img))).toBe(true)
  })
})
