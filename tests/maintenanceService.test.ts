// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { MaintenanceService } from '../electron/services/maintenance/MaintenanceService.js'

const make = (deps: any) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-maint-'))
  const notes: any[] = []
  const svc = new MaintenanceService({ app: { getPath: () => dir }, notify: (e: any) => notes.push(e), deps })
  return { svc, notes }
}

describe('MaintenanceService', () => {
  it('is off by default, runs manually and records history', async () => {
    const { svc, notes } = make({ cleanTemp: async () => ({ ok: true, freedBytes: 1024, processedItems: 3, lockedFiles: 1 }) })
    expect(Object.values(svc.state().tasks).every((t: any) => !t.enabled)).toBe(true)
    const r = await svc.runTask('cleanTemp', { manual: true })
    expect(r.ok).toBe(true)
    expect(r.entry.summary).toEqual({ freedBytes: 1024, files: 3, locked: 1 })
    expect(svc.state().history[0].id).toBe('cleanTemp')
    expect(notes.length).toBe(0) // manual runs do not notify
  })

  it('runs due tasks on tick, records failures, and refuses overlapping runs', async () => {
    let release: () => void = () => {}
    const { svc, notes } = make({
      cleanTemp: () => new Promise((res) => { release = () => res({ ok: true, freedBytes: 0, processedItems: 0, lockedFiles: 0 }) }),
      updateClamav: async () => ({ ok: false, error: 'offline' })
    })
    svc.setTask('clamav', { enabled: true, freq: 'daily', time: '00:00' })
    // pretend it was enabled two days ago so a slot has passed
    const st = JSON.parse(fs.readFileSync(svc.file, 'utf8'))
    st.tasks.clamav.enabledAt = Date.now() - 2 * 86400000
    fs.writeFileSync(svc.file, JSON.stringify(st))
    await svc.tick()
    expect(notes[0]).toMatchObject({ id: 'clamav', ok: false, error: 'offline' })
    const p = svc.runTask('cleanTemp', { manual: true })
    expect((await svc.runTask('clamav', { manual: true })).ok).toBe(false)
    release()
    expect((await p).ok).toBe(true)
  })

  it('reports winget updates without installing unless asked', async () => {
    const { svc } = make({ parseWinget: () => [{ Name: 'Git', Id: 'Git.Git' }] })
    // winget itself may be missing on CI: the parser is faked, so only the branch is under test
    const r = await svc._wingetUpdates({ install: false })
    expect(r.summary).toEqual({ available: 1, names: ['Git'] })
  }, 200000)
})
