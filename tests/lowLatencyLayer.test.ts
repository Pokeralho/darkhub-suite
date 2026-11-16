import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  LowLatencyLayerService,
  vendorFromPnp,
  modeFromEnv,
  recommendation,
  buildApplyScript,
  installDir,
  LAYER_DLL,
  LAYER_JSON,
  ENV_ENABLE,
  ENV_REFLEX
} from '../electron/services/LowLatencyLayerService.js'
import { SERVICES_DIR } from '../electron/services/binaryIntegrity.js'

describe('low latency layer helpers', () => {
  it('detects the GPU vendor from the PNP id, then the name', () => {
    expect(vendorFromPnp('PCI\\VEN_10DE&DEV_2D05')).toBe('nvidia')
    expect(vendorFromPnp('PCI\\VEN_1002&DEV_744C')).toBe('amd')
    expect(vendorFromPnp('PCI\\VEN_8086&DEV_E20B')).toBe('intel')
    expect(vendorFromPnp('', 'AMD Radeon RX 7800 XT')).toBe('amd')
    expect(vendorFromPnp('ROOT\\BasicDisplay', 'Microsoft Basic Display Adapter')).toBe('other')
  })

  it('reads the mode the way the layer reads its variables (only "1" is on)', () => {
    expect(modeFromEnv(null, null)).toBe('off')
    expect(modeFromEnv('0', '1')).toBe('off')
    expect(modeFromEnv('1', null)).toBe('antilag')
    expect(modeFromEnv('1', '1')).toBe('reflex')
  })

  it('only recommends it when an AMD or Intel GPU is present', () => {
    expect(recommendation([{ vendor: 'nvidia' }])).toBe('nativeNvidia')
    expect(recommendation([{ vendor: 'nvidia' }, { vendor: 'intel' }])).toBe('useful')
    expect(recommendation([{ vendor: 'amd' }])).toBe('useful')
    expect(recommendation([])).toBe('none')
  })

  it('installs under Program Files, not a user-writable folder', () => {
    expect(installDir({ ProgramW6432: 'C:\\Program Files' } as any)).toBe(path.join('C:\\Program Files', 'DarkHubVkLayer'))
  })

  it('builds the on/off scripts with the manifest path quoted', () => {
    const manifest = "C:\\Program Files\\Dark'Hub\\x.json"
    const on = buildApplyScript('reflex', manifest)
    expect(on).toContain("$manifest = 'C:\\Program Files\\Dark''Hub\\x.json'")
    expect(on).toContain('PropertyType DWord -Value 0')
    expect(on).toContain(`'${ENV_ENABLE}', '1', 'User'`)
    expect(on).toContain(`'${ENV_REFLEX}', '1', 'User'`)
    expect(buildApplyScript('antilag', manifest)).toContain(`'${ENV_REFLEX}', $null, 'User'`)
    const off = buildApplyScript('off', manifest)
    expect(off).toContain('Remove-ItemProperty')
    expect(off).toContain(`'${ENV_ENABLE}', $null, 'User'`)
    expect(off).not.toContain('New-ItemProperty')
  })
})

describe('LowLatencyLayerService', () => {
  const setup = (statusPayload: object) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ll-'))
    const source = path.join(root, 'src')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, LAYER_DLL), 'dll-bytes')
    fs.writeFileSync(path.join(source, LAYER_JSON), '{}')
    const env = { ProgramW6432: path.join(root, 'pf') }
    const scripts: string[] = []
    const runner = async (script: string) => {
      scripts.push(script)
      if (script.includes('Win32_VideoController')) return { code: 0, stdout: JSON.stringify(statusPayload), stderr: '' }
      return { code: 0, stdout: 'OK\n', stderr: '' }
    }
    const svc = new LowLatencyLayerService({ runner, env: env as any, source, checkIntegrity: () => null })
    return { svc, root, env, scripts }
  }

  it('rejects an unknown mode without touching anything', async () => {
    const { svc, scripts } = setup({})
    expect(await svc.apply('turbo' as any)).toEqual({ ok: false, error: 'invalid_mode' })
    expect(scripts).toHaveLength(0)
  })

  it('copies the files, registers, and reports the mode; off removes the files', async () => {
    const { svc, env, scripts } = setup({})
    const dir = installDir(env as any)
    const r = await svc.apply('reflex')
    expect(r).toMatchObject({ ok: true, mode: 'reflex', restartRequired: true })
    expect(fs.readFileSync(path.join(dir, LAYER_DLL), 'utf8')).toBe('dll-bytes')
    expect(scripts.at(-1)).toContain(path.join(dir, LAYER_JSON))

    const off = await svc.apply('off')
    expect(off).toMatchObject({ ok: true, mode: 'off', filesLeft: false })
    expect(fs.existsSync(path.join(dir, LAYER_DLL))).toBe(false)
    expect(scripts.at(-1)).toContain('Remove-ItemProperty')
  })

  it('refuses to install a helper that fails the integrity check', async () => {
    const { svc, env } = setup({})
    ;(svc as any)._checkIntegrity = () => 'integrity_failed: lowlatency/x.dll (mismatch)'
    const r = await svc.apply('antilag')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/integrity_failed/)
    expect(fs.existsSync(installDir(env as any))).toBe(false)
  })

  it('status: on only when the files are installed, the manifest is registered and the variable is set', async () => {
    const { svc, env } = setup({})
    await svc.apply('antilag')
    const manifest = path.join(installDir(env as any), LAYER_JSON)
    ;(svc as any)._run = async () => ({
      code: 0,
      stdout: JSON.stringify({ layers: [manifest.toUpperCase()], enable: '1', reflex: null, gpus: { name: 'AMD Radeon RX 6600', pnp: 'PCI\\VEN_1002&DEV_73FF' } }),
      stderr: ''
    })
    const s = await svc.getStatus()
    expect(s).toMatchObject({ ok: true, mode: 'antilag', installed: true, registered: true, upToDate: true, recommendation: 'useful' })
    expect(s.gpus).toEqual([{ name: 'AMD Radeon RX 6600', vendor: 'amd' }])

    ;(svc as any)._run = async () => ({ code: 0, stdout: JSON.stringify({ layers: [], enable: '1', gpus: [] }), stderr: '' })
    expect((await svc.getStatus()).mode).toBe('off')
  })

  it('the shipped layer files are bundled with the app', () => {
    for (const f of [LAYER_DLL, LAYER_JSON]) expect(fs.existsSync(path.join(SERVICES_DIR, 'lowlatency', f))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(SERVICES_DIR, 'lowlatency', LAYER_JSON), 'utf8'))
    expect(manifest.layer.library_path).toBe(`.\\${LAYER_DLL}`)
    expect(manifest.layer.enable_environment).toEqual({ [ENV_ENABLE]: '1' })
  })
})
