import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// @ts-expect-error JS module without types
import { REINSTALL_EDGE_SCRIPT } from '../electron/ipc/darkosIpc.js'

// ElevationHelper.runElevatedPowerShell wraps the script as `& { <script> }` and only then writes its exit/done flag
// files. A bare PowerShell `exit` inside the script ends the wrapper first, so the caller waits for the whole
// timeout (up to 15 min) and reports failure. Scripts sent through runElevatedPowerShell/runMarked must not exit.
const PS_EXIT = /(?<![:,=?]\s*)(?:^|[\s;{(])exit(?:\s+(?:-?\d+|\$\w+)|\s*;|\s*\}|\s*['"`]?\s*,?\s*$)/

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) } else if (p.endsWith('.js')) out.push(p)
  }
  return out
}

describe('elevated PowerShell scripts never call exit', () => {
  it('Reinstall Edge reports through DKEDGE markers instead of exit', () => {
    expect(REINSTALL_EDGE_SCRIPT).not.toMatch(PS_EXIT)
    for (const m of ['DKEDGE:OK', 'DKEDGE:FAIL', 'DKEDGE:NOWINGET']) expect(REINSTALL_EDGE_SCRIPT).toContain(m)
  })

  it('the pattern catches the forms that hang the wrapper', () => {
    for (const s of ["if (-not $w) { 'x'; exit 2 }", 'exit 0', "Write-Output 'x'; exit", 'exit $LASTEXITCODE', '  exit 1"']) expect(s).toMatch(PS_EXIT)
    for (const s of ['const exit = /x/.exec(r.out)', "exit === '3010'", 'code ${exit ?? 1}', 'process.exit(1)', '$__dhExitCode', '{ exitCode: exit }']) expect(s).not.toMatch(PS_EXIT)
  })

  it('no file that runs elevated scripts embeds a bare exit', () => {
    const root = path.resolve(__dirname, '../electron')
    const offenders: string[] = []
    for (const f of walk(root)) {
      if (f.endsWith(`${path.sep}ElevationHelper.js`)) continue
      const src = fs.readFileSync(f, 'utf8')
      if (!/runElevatedPowerShell|runMarked/.test(src)) continue
      src.split(/\r?\n/).forEach((line, i) => {
        const t = line.trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
        if (PS_EXIT.test(line)) offenders.push(`${path.relative(root, f)}:${i + 1}: ${t}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
