// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const scripts: string[] = []
vi.mock('../electron/services/optimizer/ElevationHelper.js', () => ({
  default: {
    isElevated: async () => true,
    runMarked: async (s: string) => { scripts.push(s); return { ok: true, out: 'DHOK|Enabled|True\nDHDONE', error: '' } }
  }
}))
// @ts-ignore - plain JS module
const { RestoreService } = await import('../electron/services/restore/RestoreService.js')

const parseErrors = (script: string) => {
  const f = path.join(os.tmpdir(), `dh-restore-${process.pid}-${scripts.indexOf(script)}.ps1`)
  fs.writeFileSync(f, script)
  try {
    return Number(execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${f.replace(/'/g, "''")}', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' }).trim())
  } finally { fs.rmSync(f, { force: true }) }
}

describe('RestoreService', () => {
  it('builds ASCII, parseable elevated scripts for capabilities, features (WU and ISO) and the Store', async () => {
    const svc = new RestoreService()
    expect((await svc.install('wmp-legacy')).ok).toBe(true)
    expect(await svc.install('directplay')).toMatchObject({ ok: true, restartNeeded: true })
    const iso = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-iso-'))
    fs.mkdirSync(path.join(iso, 'sources', 'sxs'), { recursive: true })
    expect((await svc.install('netfx3', { isoRoot: iso })).ok).toBe(true)
    fs.rmSync(iso, { recursive: true, force: true })
    expect((await svc.install('store')).ok).toBe(true)
    expect(scripts).toHaveLength(4)
    for (const s of scripts) {
      expect(/^[\x00-\x7F]*$/.test(s)).toBe(true)
      expect(parseErrors(s)).toBe(0)
    }
    expect(scripts[0]).toContain("'Media.WindowsMediaPlayer' + '~*'")
    expect(scripts[0]).toMatch(/Unlock-DhWu[\s\S]*Restore-DhWu/)
    expect(scripts[1]).toMatch(/LegacyComponents[\s\S]*DirectPlay/)
    expect(scripts[2]).toContain('-LimitAccess')
    expect(scripts[2]).not.toMatch(/^\s*Unlock-DhWu\s*$/m)
  }, 60000)

  it('refuses an ISO without sources\\sxs and unknown ids', async () => {
    const svc = new RestoreService()
    const n = scripts.length
    expect((await svc.install('netfx3', { isoRoot: path.join(os.tmpdir(), 'no-such-iso-dh') })).ok).toBe(false)
    expect((await svc.install('nope')).ok).toBe(false)
    expect(scripts.length).toBe(n)
  })
})
