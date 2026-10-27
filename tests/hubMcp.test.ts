// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
// @ts-ignore - plain JS modules
import { HubMcp, BRIDGE_EXE } from '../electron/services/hub/HubMcp.js'
// @ts-ignore
import { HubCatalog, verifyDownload, signedMessage, compareSemver } from '../electron/services/hub/HubCatalog.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-mcp-'))
const app = { getPath: () => dir, getVersion: () => '0.7.3' }

const installs: string[] = []
const hub = {
  hardware: async () => ({ chassis: 'desktop', cpuVendor: 'amd' }),
  builtins: () => new Map<string, any>([['tweak:disableGameDvr', { kind: 'tweak', title: 'Game DVR', risk: 'low', securityRelated: false }], ['op:timerTuning', { kind: 'op', title: 'Timer', risk: 'medium', packageUse: 'yes', reversible: true, tweakIds: null }]]),
  inspect: async (text: string) => (text.includes('bad') ? { ok: false, errors: [{ path: '/', message: 'ruim' }] } : { ok: true, applicable: true, risk: 'low', pkg: { id: 'ana.x', name: 'X' }, rows: [{ group: 'Ajuste', title: 'Game DVR', target: '' }], skipped: [] }),
  install: async (text: string) => { installs.push(text); return { ok: true, applied: 1 } },
  list: () => ({ ok: true, packages: [] }),
  record: () => null
}
let answer = true
const approvals: any[] = []
let mcp: any
let url = ''
let token = ''

async function rpc(body: any, headers: Record<string, string> = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers }, body: JSON.stringify(body) })
  return { status: r.status, body: r.status === 202 ? null : await r.json(), session: r.headers.get('mcp-session-id') }
}

beforeAll(async () => {
  fs.writeFileSync(path.join(dir, 'mcp.json'), JSON.stringify({ port: 0 }))
  mcp = new HubMcp({ app, hub, catalog: { search: async () => ({ ok: true, items: [] }) }, approve: async (r: any) => { approvals.push(r); return answer } })
  const st = await mcp.setEnabled(true)
  expect(st.running).toBe(true)
  url = st.url
  token = st.token
})
afterAll(async () => { await mcp.stop(); fs.rmSync(dir, { recursive: true, force: true }) })

describe('MCP server', () => {
  it('speaks MCP: initialize, tools/list, notifications', async () => {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' }, capabilities: {} } })
    expect(init.body.result.protocolVersion).toBe('2025-06-18')
    expect(init.body.result.serverInfo.name).toBe('darkhub')
    expect(init.session).toBeTruthy()
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(list.body.result.tools.map((t: any) => t.name)).toContain('darkhub_install')
    expect((await rpc({ jsonrpc: '2.0', id: 3, method: 'nope' })).body.error.code).toBe(-32601)
  })

  it('refuses no token, browser origins and foreign hosts', async () => {
    expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${token}` } })).status).toBe(405)
  })

  it('read tools answer, install waits for approval', async () => {
    const call = async (name: string, args: any = {}) => JSON.parse((await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } })).body.result.content[0].text)
    expect((await call('darkhub_builtins', { kind: 'op' })).items.map((i: any) => i.ref)).toEqual(['darkhub:op:timerTuning'])
    expect((await call('darkhub_validate', { package: 'bad' })).ok).toBe(false)
    answer = false
    expect((await call('darkhub_install', { package: { id: 'ana.x' } })).error).toMatch(/não aprovou/)
    expect(installs).toEqual([])
    answer = true
    expect((await call('darkhub_install', { package: { id: 'ana.x' } })).ok).toBe(true)
    expect(installs).toHaveLength(1)
    expect(approvals.at(-1)).toMatchObject({ title: 'Instalar X' })
  })

  it('the stdio bridge relays to the server and reports when it is off', async () => {
    if (!fs.existsSync(BRIDGE_EXE)) return // npm run build:native
    const run = (lines: string[]) => new Promise<string[]>((resolve) => {
      const p = spawn(BRIDGE_EXE, ['--config', path.join(dir, 'mcp.json')])
      let out = ''
      p.stdout.on('data', (d) => { out += d })
      p.on('close', () => resolve(out.trim().split('\n').filter(Boolean)))
      p.stdin.end(lines.join('\n') + '\n')
    })
    const out = await run([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-desktop' }, capabilities: {} } }),
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      JSON.stringify({ jsonrpc: '2.0', id: 'a', method: 'tools/call', params: { name: 'darkhub_hardware', arguments: {} } })
    ])
    expect(out).toHaveLength(2)
    expect(JSON.parse(out[0]).result.serverInfo.name).toBe('darkhub')
    expect(JSON.parse(out[1]).id).toBe('a')
    expect(JSON.parse(JSON.parse(out[1]).result.content[0].text).hardware.cpuVendor).toBe('amd')
    await mcp.setEnabled(false)
    const off = await run([JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'ping' })])
    expect(JSON.parse(off[0]).error.message).toMatch(/off/)
    await mcp.setEnabled(true)
    url = mcp.status().url
  }, 30000)
})

describe('Hub catalog client', () => {
  const keys = crypto.generateKeyPairSync('ed25519')
  const pub = keys.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  const signed = (text: string, tier = 'community', over: any = {}) => {
    const pkg = JSON.parse(text)
    const sha256 = crypto.createHash('sha256').update(text).digest('hex')
    return { id: pkg.id, version: pkg.version, tier, sha256, text, signature: crypto.sign(null, Buffer.from(signedMessage(pkg.id, pkg.version, sha256, tier)), keys.privateKey).toString('base64'), ...over }
  }
  const text = JSON.stringify({ id: 'ana.xy', version: '1.2.0' })

  it('verifies hash, signature, tier and identity', () => {
    expect(verifyDownload(signed(text), [pub])).toBeNull()
    expect(verifyDownload({ ...signed(text), tier: 'official' }, [pub])).toMatch(/assinatura/)
    expect(verifyDownload({ ...signed(text), text: text.replace('1.2.0', '9.9.9') }, [pub])).toMatch(/hash/)
    expect(verifyDownload(signed(text), [crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64')])).toMatch(/assinatura/)
    expect(compareSemver('1.10.0', '1.9.0')).toBe(1)
  })

  it('custom servers pin their key and never count as official', async () => {
    const official = signed(text, 'official')
    const fetchImpl = async (u: string) => ({
      ok: true, status: 200,
      json: async () => (u.endsWith('/api/meta') ? { publicKey: pub } : official)
    })
    const cat = new HubCatalog({ app, hub, fetchImpl })
    expect((await cat.setServer('http://example.com')).ok).toBe(false) // http only on loopback
    expect((await cat.setServer('http://127.0.0.1:4300')).ok).toBe(true)
    const dl = await cat.download('ana.xy')
    expect(dl.error).toBeUndefined()
    expect(dl.tier).toBe('community')
    await cat.setServer('')
    expect(cat.publicServer().official).toBe(true)
    expect((await cat.download('ana.xy')).error).toMatch(/assinatura/) // the official key did not sign this
  })

  it('a custom server signing with the official key keeps its tiers', async () => {
    // @ts-ignore
    const { OFFICIAL_KEYS } = await import('../electron/services/hub/hubKeys.js')
    const cat = new HubCatalog({ app, hub, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ publicKey: OFFICIAL_KEYS[0] }) }) })
    expect((await cat.setServer('http://localhost:4300')).server.trusted).toBe(true)
    expect(cat._tier('official', cat.server())).toBe('official')
    await cat.setServer('')
  })
})
