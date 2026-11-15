// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { SaveBackupService, templatePrefix } from '../electron/services/saves/SaveBackupService.js'

// A fake game whose saves live in a temp "Documents" folder; the manifest index is written directly (no download).
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-saves-'))
  const docs = path.join(root, 'Documents')
  const saveDir = path.join(docs, 'My Games', 'TestGame')
  fs.mkdirSync(path.join(saveDir, 'slot1'), { recursive: true })
  fs.writeFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'v1')
  fs.writeFileSync(path.join(saveDir, 'config.ini'), 'a=1')
  const userData = path.join(root, 'userData')
  fs.mkdirSync(path.join(userData, 'saves'), { recursive: true })
  fs.writeFileSync(path.join(userData, 'saves', 'manifest-index.json'), JSON.stringify([
    { name: 'Test Game', steamId: 42, installDirs: ['TestGame'], files: [{ path: '<winDocuments>/My Games/TestGame', tags: ['save'] }], registry: [] }
  ]))
  fs.writeFileSync(path.join(userData, 'saves', 'manifest-meta.json'), JSON.stringify({ checkedAt: Date.now() }))
  const app = { getPath: (k: string) => (k === 'documents' ? docs : userData) }
  const svc = new SaveBackupService({ app, getInstalledGames: async () => [{ name: 'Test Game', appId: '42', installDir: path.join(root, 'NoGameHere') }] })
  svc.setSettings({ backupRoot: path.join(root, 'Backups'), keep: 2 })
  return { root, saveDir, svc }
}

describe('SaveBackupService', () => {
  it('finds saves, backs up, skips unchanged, rotates and restores with a safety copy', async () => {
    const { root, saveDir, svc } = setup()
    const scan = await svc.scan()
    expect(scan.games).toMatchObject([{ name: 'Test Game', files: 2 }])

    const b1 = await svc.backup('Test Game')
    expect(b1).toMatchObject({ ok: true, files: 2 })
    expect((await svc.backup('Test Game')).skipped).toBe(true)

    fs.writeFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'v2')
    await new Promise((r) => setTimeout(r, 1100)) // version ids have 1 s resolution
    const b2 = await svc.backup('Test Game')
    expect(b2.ok).toBe(true)

    // restore v1 over the changed save: the current state is kept as "before-restore"
    const preview = await svc.previewRestore('Test Game', b1.id)
    expect(preview.targets.every((t: any) => t.dest && t.dest.startsWith(saveDir))).toBe(true)
    const r = await svc.restore('Test Game', b1.id)
    expect(r).toMatchObject({ ok: true, restored: 2 })
    expect(fs.readFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'utf8')).toBe('v1')
    // the state before the restore (v2) was already the newest version, so that version is the safety copy
    expect(r.safetyId).toBe(b2.id)

    // restoring over a state that was never backed up keeps it as "before-restore"
    fs.writeFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'unsaved')
    await new Promise((r) => setTimeout(r, 1100))
    const r2 = await svc.restore('Test Game', b2.id)
    expect(svc.versions('Test Game').find((v: any) => v.id === r2.safetyId)?.label).toBe('before-restore')
    expect(fs.readFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'utf8')).toBe('v2')

    // regression (found in the VM): backup and restore within the same second. The safety copy used to get the same
    // folder name as the version being restored and overwrite it.
    fs.writeFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'fast-original')
    const quick = await svc.backup('Test Game')
    fs.writeFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'fast-changed')
    const rq = await svc.restore('Test Game', quick.id)
    expect(rq.ok).toBe(true)
    expect(rq.safetyId).not.toBe(quick.id)
    expect(fs.readFileSync(path.join(saveDir, 'slot1', 'save.dat'), 'utf8')).toBe('fast-original')

    // keep = 2: older regular versions are rotated away, the safety copy stays
    fs.writeFileSync(path.join(saveDir, 'config.ini'), 'a=3')
    await new Promise((r) => setTimeout(r, 1100))
    await svc.backup('Test Game')
    const regular = svc.versions('Test Game').filter((v: any) => v.label !== 'before-restore')
    expect(regular.length).toBe(2)
    fs.rmSync(root, { recursive: true, force: true })
  }, 30000)
  it('restores Steam userdata saves (<root>/userdata/<storeUserId>) without writing to a "*" path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-saves-steam-'))
    const steam = path.join(root, 'Steam')
    const saveDir = path.join(steam, 'userdata', '777', '42', 'remote')
    fs.mkdirSync(saveDir, { recursive: true })
    fs.writeFileSync(path.join(saveDir, 'slot.sav'), 'v1')
    const userData = path.join(root, 'userData')
    fs.mkdirSync(path.join(userData, 'saves'), { recursive: true })
    fs.writeFileSync(path.join(userData, 'saves', 'manifest-index.json'), JSON.stringify([
      { name: 'Steam Game', steamId: 42, installDirs: ['SteamGame'], files: [{ path: '<root>/userdata/<storeUserId>/<storeGameId>/remote', tags: ['save'] }], registry: [] }
    ]))
    fs.writeFileSync(path.join(userData, 'saves', 'manifest-meta.json'), JSON.stringify({ checkedAt: Date.now() }))
    const app = { getPath: (k: string) => (k === 'documents' ? path.join(root, 'Documents') : userData) }
    const svc = new SaveBackupService({ app, getInstalledGames: async () => [{ name: 'Steam Game', appId: '42', installDir: path.join(root, 'NoGameHere'), libraryRoot: steam }] })
    svc.setSettings({ backupRoot: path.join(root, 'Backups') })
    expect(templatePrefix('<root>/userdata/<storeUserId>/<storeGameId>/remote')).toBe('<root>\\userdata')
    const b = await svc.backup('Steam Game')
    expect(b).toMatchObject({ ok: true, files: 1 })
    fs.writeFileSync(path.join(saveDir, 'slot.sav'), 'v2')
    const preview = await svc.previewRestore('Steam Game', b.id)
    expect(preview.targets[0].dest).toBe(path.join(saveDir, 'slot.sav'))
    const r = await svc.restore('Steam Game', b.id)
    expect(r).toMatchObject({ ok: true, restored: 1, skipped: [] })
    expect(fs.readFileSync(path.join(saveDir, 'slot.sav'), 'utf8')).toBe('v1')

    // a backup made before the fix kept "<storeUserId>" in the prefix: it is skipped, never written to a "*" path
    const vdir = path.join(root, 'Backups', 'Steam Game', b.id)
    const info = JSON.parse(fs.readFileSync(path.join(vdir, 'backup.json'), 'utf8'))
    info.groups = ['<root>\\userdata\\<storeUserId>\\<storeGameId>\\remote']
    info.files = info.files.map((f: any) => ({ ...f, prefixTemplate: info.groups[0] }))
    fs.writeFileSync(path.join(vdir, 'backup.json'), JSON.stringify(info))
    const old = await svc.previewRestore('Steam Game', b.id)
    expect(old.targets[0].dest).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  }, 30000)
})
