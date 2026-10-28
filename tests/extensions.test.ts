// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore - plain JS modules
import { validatePackage } from '../electron/services/hub/hubModel.js'
// @ts-ignore
import { scanExtension, buildExtensionDoc, describeExtension, sensorsForExtensions } from '../electron/services/hub/extensionModel.js'
// @ts-ignore
import { packExtensionFolder } from '../electron/services/hub/extensionPack.js'
// @ts-ignore
import { ExtensionHost } from '../electron/services/hub/ExtensionHost.js'

const EXAMPLE = path.join(process.cwd(), 'docs', 'hub', 'extensions', 'pokeralho.painel-termico')
const ext = (over: any = {}) => ({
  schemaVersion: 1, type: 'extension', id: 'ana.minha-ext', version: '1.0.0', name: 'Minha extensão', author: { github: 'ana' },
  permissions: ['storage'], contributes: { pages: [{ id: 'main', title: 'Principal', entry: 'index.html' }] },
  files: { 'index.html': '<h1>Oi</h1><script src="app.js"></script>', 'app.js': 'darkhub.storage.set("a", 1)' }, ...over
})

describe('extension packages', () => {
  it('the color picker extension packs and validates', () => {
    const pkg = packExtensionFolder(path.join(process.cwd(), 'docs', 'hub', 'extensions', 'pokeralho.conta-gotas'))
    const r = validatePackage(JSON.stringify(pkg))
    expect(r.errors).toEqual([])
    expect(pkg.permissions).toEqual(['screen', 'clipboard', 'storage'])
  })

  it('the example extension packs and validates', () => {
    const pkg = packExtensionFolder(EXAMPLE)
    const r = validatePackage(JSON.stringify(pkg))
    expect(r.errors).toEqual([])
    expect(r.risk).toBe('low')
    expect(Object.keys(pkg.files).sort()).toEqual(['app.js', 'index.html', 'style.css', 'widget.html'])
  })

  it('rejects broken extensions with clear errors', () => {
    expect(validatePackage(ext({ items: [{ use: 'darkhub:tweak:disableGameDvr' }] })).ok).toBe(false) // no tweak items in extensions
    expect(validatePackage(ext({ contributes: { pages: [{ id: 'main', title: 'Tela', entry: 'nope.html' }] } })).errors[0].message).toMatch(/não está em "files"/)
    expect(validatePackage(ext({ permissions: ['network'] })).errors[0].message).toMatch(/lista de endereços/)
    expect(validatePackage(ext({ permissions: ['root'] })).ok).toBe(false)
    expect(validatePackage(ext({ files: { '../x.html': '' } })).ok).toBe(false)
    expect(validatePackage(ext({ network: ['http://insecure.com'], permissions: ['network'] })).ok).toBe(false)
    expect(validatePackage({ ...ext(), type: 'preset' }).ok).toBe(false) // presets cannot carry files
  })

  it('risk and review findings', () => {
    expect(validatePackage(ext({ permissions: ['network'], network: ['https://api.github.com'] })).risk).toBe('medium')
    const evil = ext({ files: { 'index.html': '<script>eval(atob("x"))</script><script src="https://evil.example/x.js"></script>', 'app.js': 'top.location = "https://x"' } })
    const r = validatePackage(evil)
    expect(r.risk).toBe('high')
    const rules = scanExtension(evil).map((f: any) => f.rule)
    expect(rules).toEqual(expect.arrayContaining(['eval', 'remote-code', 'escape-frame']))
  })

  it('describes permissions and screens for the preview', () => {
    const rows = describeExtension(ext({ permissions: ['storage', 'network'], network: ['https://a.com'] }), 'pt-BR')
    expect(rows.map((r: any) => r.kind)).toEqual(['permission', 'permission', 'page'])
    expect(rows[1].target).toBe('https://a.com')
  })

  it('the frame document starts with the CSP and inlines local files only', () => {
    const html = buildExtensionDoc(ext({ files: { 'index.html': '<script>alert(1)</script><head></head><link rel="stylesheet" href="s.css"><script src="https://cdn.x/y.js"></script><script src="app.js"></script>', 's.css': 'body{color:red}', 'app.js': 'console.log(1)</script><b>' } }), 'index.html', { bridgeJs: 'BRIDGE', baseCss: 'BASE' })
    const csp = html.indexOf('Content-Security-Policy')
    expect(csp).toBeGreaterThan(-1)
    expect(csp).toBeLessThan(html.indexOf('alert(1)')) // policy before any extension code
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain('body{color:red}')
    expect(html).not.toContain('cdn.x')
    expect(html).toContain('console.log(1)<\\/script>') // a file cannot close the inline script early
    expect(html.indexOf('BRIDGE')).toBeLessThan(html.indexOf('alert(1)'))
  })

  it('sensors expose numbers only, never process names', () => {
    const s = sensorsForExtensions({ cpu: { values: { currentLoad: { value: 12.345 } } }, procs: { values: [{ name: 'secret.exe' }] }, gpu: { values: { gpus: [{ name: 'RTX', utilization: { value: 50 } }] } } })
    expect(s.cpu.load).toBe(12.3)
    expect(s.gpu).toMatchObject({ name: 'RTX', load: 50 })
    expect(JSON.stringify(s)).not.toContain('secret')
  })
})

describe('extension bridge permissions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ext-'))
  const app = { getPath: () => dir, getVersion: () => '0.7.3' }
  const installed: any = {
    'ana.minha-ext': { pkg: ext({ permissions: ['storage', 'network'], network: ['https://api.example.com'] }) },
    'ana.cores': { pkg: ext({ id: 'ana.cores', permissions: ['screen'] }) }
  }
  let picks: any[] = [{ ok: true, hex: '#2ee6f2', rgb: [46, 230, 242], x: 10, y: 20, image: 'should not leak' }, { ok: false, canceled: true }]
  const fetched: string[] = []
  const host = new ExtensionHost({
    app,
    hub: { record: (id: string) => installed[id] || null, hardware: async () => ({ cpuVendor: 'amd' }) },
    catalog: {}, approve: async () => false,
    sensors: { read: () => ({}), hold: () => {}, release: () => {} },
    notify: async () => {}, clipboard: () => {}, openExternal: async () => {}, pickColor: async () => picks.shift(),
    fetchImpl: async (u: string) => { fetched.push(u); return { ok: true, status: 200, headers: new Map([['content-type', 'application/json']]) as any, arrayBuffer: async () => new TextEncoder().encode('{"a":1}').buffer } }
  })

  it('allows what was declared and refuses everything else', async () => {
    await host.call('ana.minha-ext', 'storage.set', { key: 'x', value: { n: 1 } })
    expect(await host.call('ana.minha-ext', 'storage.get', { key: 'x' })).toEqual({ n: 1 })
    await expect(host.call('ana.minha-ext', 'hardware.info')).rejects.toThrow(/permissão "hardware"/)
    await expect(host.call('ana.minha-ext', 'packages.install', { pkg: {} })).rejects.toThrow(/permissão "packages"/)
    await expect(host.call('ana.minha-ext', 'fs.read')).rejects.toThrow(/desconhecido/)
    await expect(host.call('other.ext', 'storage.get', { key: 'x' })).rejects.toThrow(/não instalada/)
  })

  it('network only to the declared https origins', async () => {
    const r = await host.call('ana.minha-ext', 'net.fetch', { url: 'https://api.example.com/v1?q=1' })
    expect(r).toMatchObject({ ok: true, status: 200, body: '{"a":1}' })
    await expect(host.call('ana.minha-ext', 'net.fetch', { url: 'https://evil.example.com/' })).rejects.toThrow(/não está na lista/)
    await expect(host.call('ana.minha-ext', 'net.fetch', { url: 'http://api.example.com/' })).rejects.toThrow(/não está na lista/)
    expect(fetched).toEqual(['https://api.example.com/v1?q=1'])
  })

  it('screen color: only with the "screen" permission, and only the chosen color', async () => {
    await expect(host.call('ana.minha-ext', 'screen.pickColor')).rejects.toThrow(/permissão "screen"/)
    expect(await host.call('ana.cores', 'screen.pickColor')).toEqual({ hex: '#2ee6f2', rgb: [46, 230, 242], x: 10, y: 20 })
    expect(await host.call('ana.cores', 'screen.pickColor')).toBeNull()
  })

  it('storage is capped and per extension', async () => {
    await expect(host.call('ana.minha-ext', 'storage.set', { key: 'big', value: 'x'.repeat(1_100_000) })).rejects.toThrow(/cheio/)
    expect(fs.existsSync(path.join(dir, 'hub', 'ext-data', 'ana.minha-ext.json'))).toBe(true)
  })
})
