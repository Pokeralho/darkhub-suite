// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS module
import { MaintenanceService } from '../electron/services/maintenance/MaintenanceService.js'
// @ts-ignore - plain JS module
import { nextRun } from '../electron/services/maintenance/schedule.js'

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
    const calls: string[][] = []
    const { svc } = make({ parseWinget: () => [{ Name: 'Git', Id: 'Git.Git' }], winget: async (args: string[]) => { calls.push(args); return { code: 0, stdout: 'table', stderr: '' } } })
    const r = await svc._wingetUpdates({ install: false })
    expect(r.summary).toEqual({ available: 1, names: ['Git'] })
    expect(calls.length).toBe(1)
  })

  it('treats a missing winget or a failed upgrade as a failure, not as zero updates', async () => {
    const missing = make({ parseWinget: () => [], winget: async () => ({ code: 1, missing: true, stdout: '', stderr: '' }) })
    const r1 = await missing.svc.runTask('wingetUpdates', { manual: true })
    expect(r1.ok).toBe(false)
    expect(r1.error).toMatch(/winget/)
    // nothing to update can exit non-zero: still a success
    const empty = make({ parseWinget: () => [], winget: async () => ({ code: -1978335212, stdout: 'No available upgrades found.', stderr: '' }) })
    expect((await empty.svc.runTask('wingetUpdates', { manual: true })).ok).toBe(true)
    // install on: upgrade --all fails and the package is still pending
    const failing = make({ parseWinget: () => [{ Name: 'Git' }], winget: async (args: string[]) => ({ code: args.includes('--all') ? 5 : 0, stdout: 'table', stderr: '' }) })
    failing.svc.setTask('wingetUpdates', { options: { install: true } })
    const r3 = await failing.svc.runTask('wingetUpdates', { manual: true })
    expect(r3.ok).toBe(false)
    expect(r3.entry.summary).toMatchObject({ available: 1, installed: 0, remaining: 1, exitCode: 5 })
  })

  it('fails when every security list fails and keeps partial counts', async () => {
    const all = make({ updateSecurityLists: async () => ({ ok: false, results: [{ id: 'a', ok: false, error: 'offline' }, { id: 'b', ok: false, error: 'offline' }] }) })
    const r = await all.svc.runTask('securityLists', { manual: true })
    expect(r.ok).toBe(false)
    expect(r.entry.summary).toEqual({ updated: 0, failed: 2 })
    const part = make({ updateSecurityLists: async () => ({ ok: false, results: [{ id: 'a', ok: true }, { id: 'b', ok: false, error: 'offline' }] }) })
    const r2 = await part.svc.runTask('securityLists', { manual: true })
    expect(r2.ok).toBe(true)
    expect(r2.entry.summary).toEqual({ updated: 1, failed: 1 })
    const saves = make({ backupSaves: async () => ({ results: [{ ok: false, error: 'locked' }] }) })
    const r3 = await saves.svc.runTask('saveBackups', { manual: true })
    expect(r3.ok).toBe(false)
    expect(r3.entry.summary.failed).toBe(1)
  })

  it('a failed run keeps the schedule and is retried with backoff', async () => {
    let fail = true
    const { svc } = make({ updateClamav: async () => (fail ? { ok: false, error: 'offline' } : { ok: true }) })
    svc.setTask('clamav', { enabled: true, freq: 'weekly', weekday: 0, time: '00:00' })
    const st = JSON.parse(fs.readFileSync(svc.file, 'utf8'))
    st.tasks.clamav.enabledAt = Date.now() - 8 * 86400000
    fs.writeFileSync(svc.file, JSON.stringify(st))
    await svc.tick()
    let s = svc.state()
    expect(s.tasks.clamav.lastRunAt).toBeNull()
    expect(s.tasks.clamav.failures).toBe(1)
    // retried in about an hour, not a week later
    expect(s.tasks.clamav.nextRunAt - s.tasks.clamav.lastAttemptAt).toBeLessThanOrEqual(60 * 60 * 1000)
    await svc.tick() // not yet: still inside the backoff
    expect(svc.state().history.length).toBe(1)
    const st2 = JSON.parse(fs.readFileSync(svc.file, 'utf8'))
    st2.tasks.clamav.lastAttemptAt = Date.now() - 61 * 60 * 1000
    fs.writeFileSync(svc.file, JSON.stringify(st2))
    fail = false
    await svc.tick()
    s = svc.state()
    expect(s.history.length).toBe(2)
    expect(s.tasks.clamav.lastRunAt).not.toBeNull()
    expect(s.tasks.clamav.failures).toBe(0)
    // back on the regular schedule, anchored to the successful run
    expect(s.tasks.clamav.nextRunAt).toBe(nextRun(s.tasks.clamav, s.tasks.clamav.lastRunAt))
  })
})
