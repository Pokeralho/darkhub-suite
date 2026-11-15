// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import crypto from 'node:crypto'
// @ts-ignore - plain JS module
import { SerialService, validateSerialOptions } from '../electron/services/ssh/SerialService.js'
// @ts-ignore - plain JS module
import { stripAnsi } from '../electron/services/ssh/SshSessionManager.js'
// @ts-ignore - plain JS module
import { decodeText, encodeText } from '../electron/services/ssh/SftpService.js'
// @ts-ignore - plain JS module
import { SshVaultStore, normalizeTerminalSettings } from '../electron/services/ssh/SshVaultStore.js'

function fakeBridge() {
  const child: any = new EventEmitter()
  child.stdout = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn()
  const written: string[] = []
  child.stdin.on('data', (d: Buffer) => written.push(...d.toString().split('\n').filter(Boolean)))
  return { child, written }
}

describe('serial terminal', () => {
  it('validates options and refuses odd port names', () => {
    expect(validateSerialOptions({ port: 'com3', baud: 115200 })).toMatchObject({ port: 'COM3', dataBits: 8, parity: 'None', stopBits: 'One', newline: 'cr' })
    expect(() => validateSerialOptions({ port: 'COM3; calc' })).toThrow(/COM3/)
    expect(() => validateSerialOptions({ port: 'COM1', dataBits: 9 })).toThrow()
  })

  it('opens through the bridge, streams data, translates Enter and closes', async () => {
    const { child, written } = fakeBridge()
    const spawn = vi.fn(() => child)
    const svc = new SerialService({ spawn, platform: 'win32' })
    const events: any[] = []
    const opening = svc.open({ sessionId: 'c1', port: 'COM7', baud: 9600, newline: 'crlf' }, (ch: string, p: any) => events.push([ch, p]))
    // settings go through env vars, not the script
    const env = (spawn.mock.calls[0] as any)[2].env
    expect(env).toMatchObject({ DH_PORT: 'COM7', DH_BAUD: '9600', DH_PARITY: 'None' })
    child.stdout.write('OPEN\n')
    expect(await opening).toMatchObject({ ok: true, status: 'connected' })
    child.stdout.write(`D${Buffer.from('Router> ').toString('base64')}\n`)
    await new Promise((r) => setTimeout(r, 30))
    expect(events.filter(([c]) => c === 'ssh:session:data').map(([, p]) => p.data).join('')).toBe('Router> ')
    expect(svc.write('c1', 'show ver\r')).toBe(true)
    await new Promise((r) => setTimeout(r, 10))
    expect(Buffer.from(written[0].slice(1), 'base64').toString()).toBe('show ver\r\n')
    expect(svc.sendBreak('c1')).toBe(true)
    svc.close('c1')
    await new Promise((r) => setTimeout(r, 10))
    expect(written).toContain('BRK')
    expect(written).toContain('Q')
    expect(events.at(-1)).toEqual(['ssh:session:status', { sessionId: 'c1', status: 'closed', error: undefined }])
  })

  it('reports a busy port', async () => {
    const { child } = fakeBridge()
    const svc = new SerialService({ spawn: () => child, platform: 'win32' })
    const opening = svc.open({ sessionId: 'c2', port: 'COM3', baud: 9600 }, () => {})
    child.stdout.write("EAccess to the port 'COM3' is denied.\n")
    expect(await opening).toMatchObject({ ok: false, code: 'PORT_IN_USE' })
  })
})

describe('text helpers', () => {
  it('strips terminal escapes for logs', () => {
    expect(stripAnsi('\x1b[1;32mok\x1b[0m\r\nnext\x1b]0;title\x07\r\n')).toBe('ok\nnext\n')
  })

  it('round-trips CRLF, BOM and latin1 files', () => {
    const crlf = decodeText(Buffer.from('a\r\nb\r\n'))
    expect(crlf).toMatchObject({ eol: 'crlf', content: 'a\nb\n', encoding: 'utf-8' })
    expect(encodeText(crlf.content, crlf).toString()).toBe('a\r\nb\r\n')
    const bom = decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]))
    expect(bom).toMatchObject({ bom: true, content: 'hi' })
    expect([...encodeText('hi', bom)]).toEqual([0xef, 0xbb, 0xbf, 0x68, 0x69])
    const latin = decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]))
    expect(latin).toMatchObject({ encoding: 'latin1', content: 'café' })
    expect([...encodeText('café', latin)]).toEqual([0x63, 0x61, 0x66, 0xe9])
    expect(decodeText(Buffer.from([1, 0, 2]))).toEqual({ binary: true })
  })
})

describe('terminal settings', () => {
  it('clamps values and persists only known fields', () => {
    expect(normalizeTerminalSettings({ fontSize: 99, cursorStyle: 'weird', scrollback: 10, fontFamily: 'x;}<script>' })).toMatchObject({ fontSize: 13, cursorStyle: 'block', scrollback: 10000, fontFamily: 'Geist Mono Variable' })
    const s = new SshVaultStore({ getKey: () => crypto.randomBytes(32), persist: false })
    s.saveSettings({ terminal: { fontSize: 16, copyOnSelect: true } })
    expect(s.getState().settings.terminal).toMatchObject({ fontSize: 16, copyOnSelect: true, rightClickPaste: true })
    const h = s.saveHost({ hostname: 'a.lan', logSession: true, agentForward: true })
    expect(h).toMatchObject({ logSession: true, agentForward: true })
  })
})
