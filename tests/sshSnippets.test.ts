// @vitest-environment node
import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
// @ts-ignore - plain JS module
import { renderSnippet, normalizeArgsSchema, placeholdersOf, shellQuote } from '../electron/services/ssh/snippetTemplate.js'
// @ts-ignore - plain JS module
import { SshVaultStore } from '../electron/services/ssh/SshVaultStore.js'

describe('snippet template', () => {
  it('finds placeholders once, in order', () => {
    expect(placeholdersOf('tail -n {{lines}} {{ file }} {{lines}}')).toEqual(['lines', 'file'])
  })

  it('keeps declared args the body uses and adds undeclared ones', () => {
    const schema = normalizeArgsSchema([{ name: 'file', default: '/var/log/syslog' }, { name: 'unused' }], 'tail {{file}} {{n}}')
    expect(schema.map((a: any) => a.name)).toEqual(['file', 'n'])
    expect(schema[0].default).toBe('/var/log/syslog')
  })

  it('quotes values so they cannot inject commands', () => {
    const out = renderSnippet({ body: 'grep {{pat}} /etc/hosts', argsSchema: [] }, { pat: "x'; rm -rf / #" })
    expect(out).toBe(`grep 'x'\\''; rm -rf / #' /etc/hosts\r`)
    expect(shellQuote('simple-value_1.txt')).toBe('simple-value_1.txt')
  })

  it('refuses newlines and control characters even for raw args', () => {
    expect(() => renderSnippet({ body: 'echo {{a}}', argsSchema: [{ name: 'a', raw: true }] }, { a: 'ok\nreboot' })).toThrow(/Invalid/)
  })

  it('uses defaults and reports missing args', () => {
    expect(renderSnippet({ body: 'df -h {{p}}', argsSchema: [{ name: 'p', default: '/' }] })).toBe('df -h /\r')
    try {
      renderSnippet({ body: 'ping {{host}}', argsSchema: [] })
      throw new Error('should fail')
    } catch (e: any) {
      expect(e.code).toBe('MISSING_ARG')
      expect(e.names).toEqual(['host'])
    }
  })

  it('sends multi-line bodies line by line with CR', () => {
    expect(renderSnippet({ body: 'cd /tmp\r\nls -la\n\n', argsSchema: [] })).toBe('cd /tmp\rls -la\r')
  })
})

describe('snippet store', () => {
  const key = crypto.randomBytes(32)
  it('CRUD with packages; deleting a package keeps its snippets', () => {
    const s = new SshVaultStore({ getKey: () => key, persist: false })
    const pkg = s.savePackage({ name: 'Docker' })
    const sn = s.saveSnippet({ name: 'ps', body: 'docker ps -a --filter name={{name}}', packageId: pkg.id })
    expect(sn.argsSchema).toEqual([{ name: 'name', label: '', default: '', raw: false }])
    s.deleteSnippet(pkg.id, 'package')
    expect(s.getSnippet(sn.id).packageId).toBeNull()
    const h = s.saveHost({ hostname: 'a.lan', startupSnippetId: sn.id })
    s.deleteSnippet(sn.id)
    expect(s.getHost(h.id).startupSnippetId).toBeNull()
    expect(() => s.saveSnippet({ name: 'empty', body: '   ' })).toThrow(/body/)
  })
})
