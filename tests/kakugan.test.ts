// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS modules
import { KakuganClient, sessionFromSetCookie } from '../electron/services/kakugan/KakuganClient.js'
// @ts-ignore
import { makeTokenStore } from '../electron/ipc/kakuganIpc.js'
// @ts-ignore
import { parseReleasePage, parseSha256File, isNewerBuild } from '../electron/services/darkos/darkosRelease.js'

const res = (status: number, body: unknown, cookies: string[] = []) => ({
  ok: status >= 200 && status < 300, status,
  headers: { getSetCookie: () => cookies },
  json: async () => body
})

describe('Kakugan client', () => {
  it('reads, keeps and clears the session cookie', () => {
    expect(sessionFromSetCookie(['kg_sess=abc%2Bdef; Path=/; HttpOnly; Secure'])).toBe('abc+def')
    expect(sessionFromSetCookie(['kg_sess=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'])).toBeNull()
    expect(sessionFromSetCookie(['other=1'])).toBeUndefined()
  })

  it('sends the session, JSON bodies and no Origin; a 401 signs out', async () => {
    let token: string | null = null
    const calls: any[] = []
    const replies = [res(200, { id: 'u1', name: 'Ana' }, ['kg_sess=tok1; Path=/']), res(200, { plans: [] }), res(401, { error: 'Entre na sua conta para continuar.' })]
    const c = new KakuganClient({ store: { get: () => token, set: (v: string | null) => { token = v } }, fetchImpl: async (url: string, init: any) => { calls.push({ url, init }); return replies.shift() } })
    expect((await c.login('a@b.com', 'pw123456')).name).toBe('Ana')
    expect(token).toBe('tok1')
    expect(calls[0].init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body)).toEqual({ email: 'a@b.com', password: 'pw123456' })
    await c.dashboard()
    expect(calls[1].init.headers.cookie).toBe('kg_sess=tok1')
    expect(calls[1].init.headers.origin).toBeUndefined()
    await expect(c.dashboard()).rejects.toMatchObject({ status: 401, message: 'Entre na sua conta para continuar.' })
    expect(token).toBeNull()
  })

  it('keeps the token only encrypted on disk', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dh-kg-')), 'kakugan-session.bin')
    const safe = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s.split('').reverse().join('')), decryptString: (b: Buffer) => b.toString().split('').reverse().join('') }
    makeTokenStore(file, safe).set('secret-token')
    expect(fs.readFileSync(file, 'utf8')).not.toContain('secret-token')
    expect(makeTokenStore(file, safe).get()).toBe('secret-token')
    makeTokenStore(file, safe).set(null)
    expect(fs.existsSync(file)).toBe(false)
    // without safeStorage nothing is written
    makeTokenStore(file, { isEncryptionAvailable: () => false }).set('x')
    expect(fs.existsSync(file)).toBe(false)
  })
})

describe('DarkOS releases', () => {
  const html = `<h2>DarkOS 26H2 v1.0</h2><span>Última versão</span><p>v1.0 25 out 2026 26300.9550</p>
    <a href="../files/DarkOS_26H2_Pro_26300.9550_x64_pt-BR.iso">iso</a><a href="../files/DarkOS_26H2_Pro_26300.9550_x64_pt-BR.iso.sha256">sha</a>`
  it('reads the ISO, version and build from the releases page', () => {
    expect(parseReleasePage(html)).toMatchObject({
      version: '1.0', build: '26300.9550', date: '25 out 2026', isoName: 'DarkOS_26H2_Pro_26300.9550_x64_pt-BR.iso',
      url: 'https://darkos.darkhub.ink/files/DarkOS_26H2_Pro_26300.9550_x64_pt-BR.iso'
    })
    expect(parseReleasePage('<p>nothing</p>')).toBeNull()
  })
  it('reads the published hash and compares builds', () => {
    expect(parseSha256File('75AA00d3a12e5419be56d927685a1027bb0e2c8763ef8b04e6747b19e03ef488  DarkOS.iso\n')).toBe('75aa00d3a12e5419be56d927685a1027bb0e2c8763ef8b04e6747b19e03ef488')
    expect(parseSha256File('not a hash')).toBeNull()
    expect(isNewerBuild('26300.9600', '26300.9550')).toBe(true)
    expect(isNewerBuild('26300.9550', '26300.9550')).toBe(false)
    expect(isNewerBuild('26200.9999', '26300.1')).toBe(false)
  })
})

// @ts-ignore
import { kakuganAlerts, accountsToPause } from '../electron/services/kakugan/kakuganAlerts.js'

describe('Kakugan tray alerts', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')
  const acc = (state: string) => ({ id: 'a1', steamLogin: 'gamer', nickname: 'Gamer', state })
  const dash = (o: any = {}) => ({ asfOnline: true, plans: [{ id: 'p1', name: 'Ilimitado', kind: 'UNLIMITED', active: true, expiresAt: '2026-12-01T00:00:00Z', minutesTotal: 0, minutesUsed: 0, accounts: [acc('online')], ...o }] })

  it('warns once when Steam asks for a code, not on every poll', () => {
    const sent = new Set<string>()
    const a = kakuganAlerts(dash(), dash({ accounts: [acc('needs_app_code')] }), sent, now)
    expect(a).toHaveLength(1)
    expect(a[0].title).toContain('Gamer')
    a.forEach((x: any) => sent.add(x.key))
    expect(kakuganAlerts(dash({ accounts: [acc('needs_app_code')] }), dash({ accounts: [acc('needs_app_code')] }), sent, now + 1)).toHaveLength(0)
  })
  it('plan ending, hours running out and the farm going down/up', () => {
    const sent = new Set<string>()
    const ending = kakuganAlerts(null, dash({ expiresAt: '2026-10-28T00:00:00Z' }), sent, now)
    expect(ending.map((x: any) => x.key)).toEqual(['expire:p1'])
    sent.add('expire:p1')
    expect(kakuganAlerts(null, dash({ expiresAt: '2026-10-28T00:00:00Z' }), sent, now)).toHaveLength(0)
    const hours = kakuganAlerts(null, dash({ kind: 'HOURS', minutesTotal: 18000, minutesUsed: 17700 }), new Set(), now)
    expect(hours[0].title).toContain('5 horas')
    expect(kakuganAlerts(dash(), { ...dash(), asfOnline: false }, new Set(), now)[0].title).toContain('fora do ar')
    expect(kakuganAlerts({ ...dash(), asfOnline: false }, dash(), new Set(), now)[0].title).toContain('de volta')
  })
  it('pauses only accounts that are farming on active plans', () => {
    const d = { plans: [
      { active: true, accounts: [{ id: 'x', state: 'online' }, { id: 'y', state: 'paused' }, { id: 'z', state: 'connecting' }] },
      { active: false, accounts: [{ id: 'w', state: 'online' }] }
    ] }
    expect(accountsToPause(d)).toEqual(['x', 'z'])
  })
})
