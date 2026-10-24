// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { runCode, detectRuntimes } from '../electron/services/CodeRunner.js'

// process.execPath here is Node (vitest), which runs .js the same way Electron-as-Node does
describe('CodeRunner', () => {
  it('runs JavaScript with stdin and captures stdout/stderr', async () => {
    const code = "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log('oi '+d.trim());console.error('aviso')})"
    const r = await runCode({ language: 'javascript', code, input: 'mundo' })
    expect(r.ok).toBe(true)
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe('oi mundo')
    expect(r.stderr).toContain('aviso')
  })

  it('kills a program that runs past the time limit', async () => {
    const r = await runCode({ language: 'javascript', code: 'while(true){}', timeoutSec: 1 })
    expect(r.timedOut).toBe(true)
  }, 15000)

  it('runs PowerShell with accents and reports missing runtimes', async () => {
    const r = await runCode({ language: 'powershell', code: 'Write-Output ("ação " + (2+3))' })
    expect(r.stdout.trim()).toBe('ação 5')
    const all = await detectRuntimes()
    expect(all.javascript.available).toBe(true)
    expect((await runCode({ language: 'cobol', code: 'x' })).ok).toBe(false)
  }, 20000)
})

describe('code examples', () => {
  it('every example runs on the runtimes installed here', async () => {
    const { EXAMPLES } = await import('../src/lib/codeExamples')
    const all = await detectRuntimes()
    const ran: string[] = []
    for (const [lang, set] of Object.entries(EXAMPLES)) {
      if (!all[lang]?.available) continue
      for (const [id, code] of Object.entries(set as Record<string, string>)) {
        const r = await runCode({ language: lang, code, input: lang === 'c' ? '2 3' : 'Maria', timeoutSec: 60 })
        expect(r.code, `${lang}/${id}: ${r.stderr}`).toBe(0)
        expect(r.stdout.length, `${lang}/${id}`).toBeGreaterThan(0)
        ran.push(`${lang}/${id}`)
      }
    }
    console.log('examples ran:', ran.join(' '))
    expect(ran.length).toBeGreaterThanOrEqual(6)
  }, 300000)
})
