// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
// @ts-ignore - plain JS modules
import { PAWNIO } from '../electron/services/hwsensors/pawnio.js'
// @ts-ignore
import { CLAMAV } from '../electron/services/realtime/ClamAv.js'

const script = fs.readFileSync('build/deps/install-deps.ps1', 'utf8')

describe('setup components script (build/deps/install-deps.ps1)', () => {
  it('pins the same versions and hashes as the app', () => {
    for (const dep of [PAWNIO, CLAMAV]) {
      expect(script).toContain(dep.url)
      expect(script).toContain(dep.sha256)
    }
  })

  it('is ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI)', () => {
    expect(/[^\x00-\x7f]/.test(script)).toBe(false)
  })

  it('parses in PowerShell and never fails the setup', () => {
    expect(script.trimEnd().endsWith('exit 0')).toBe(true)
    if (process.platform !== 'win32') return
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${process.cwd().replace(/'/g, "''")}\\build\\deps\\install-deps.ps1', [ref]$null, [ref]$e); $e.Count`], { encoding: 'utf8' })
    expect(out.trim()).toBe('0')
  })

  it('is shipped with the app and run by the NSIS setup', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    expect(pkg.build.extraResources).toContainEqual({ from: 'build/deps', to: 'deps' })
    expect(pkg.build.nsis.perMachine).toBe(true)
    expect(fs.readFileSync('build/installer.nsh', 'utf8')).toContain('resources\\deps\\install-deps.ps1')
  })
})
