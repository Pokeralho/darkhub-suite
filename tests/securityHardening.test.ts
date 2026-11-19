// @vitest-environment node
// Security audit fixes (main process): secure staging, host validation, extension permission growth, local-only dev
// folders, vault bridge frame ordering, native binary coverage, injector policy, recovery-word derivation,
// elevated-script bootstrap and the lazy Kakugan token store.
import { describe, it, expect, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
// @ts-ignore plain JS modules
import { createSecureStagingDir, writeStagedFile, assertUnchanged, sha256FileSync, lockdownArgs, ownerArgs, defaultStagingRoot, _resetStagingCache } from '../electron/services/secureStaging.js'
// @ts-ignore
import { safeHost, assertSafeHost, isSafeHost } from '../electron/services/network/hostValidation.js'
// @ts-ignore
import { assertSafeHost as netLatencyAssert } from '../electron/services/NetLatencyService.js'
// @ts-ignore
import { permissionGrowth, hasGrowth, approveGrowth } from '../electron/services/hub/HubCatalog.js'
// @ts-ignore
import { isLocalFolderPath } from '../electron/services/hub/HubMcp.js'
// @ts-ignore
import { listBinaries, collect } from '../scripts/gen-integrity.mjs'
// @ts-ignore
import { injectTargetRefusal } from '../electron/services/injectPolicy.js'
// @ts-ignore
import { derivePasswordFromRecoveryWords, recoveryDeriveOrder, wrapVaultKeyWithRecoveryWords, unwrapVaultKeyWithPassword, wrapVaultKeyWithPassword, buildKdf, RECOVERY_DERIVE_VERSION } from '../electron/vaultCrypto.js'
// @ts-ignore
import { encodeVbs, buildVerifiedBootstrap, buildCmdRunnerScript } from '../electron/services/optimizer/ElevationHelper.js'
// @ts-ignore
import { makeTokenStore } from '../electron/ipc/kakuganIpc.js'
// @ts-ignore
import { FrameDecoder, encodeFrame, buildClientProof, hmacHex } from '../electron/services/vaultBridge/protocol.js'
// @ts-ignore
import { PairingStore } from '../electron/services/vaultBridge/pairingStore.js'
// @ts-ignore
import { VaultBridgeServer } from '../electron/services/vaultBridge/bridgeServer.js'
// @ts-ignore
import { ALLOWED_CALLERS, CHROMIUM_EXTENSION_ID } from '../electron/services/vaultBridge/nativeHost.js'

const tmpDirs: string[] = []
const mkTmp = (p = 'dh-sec-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); tmpDirs.push(d); return d }
afterEach(() => { for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('secure staging', () => {
  it('elevated: recreates the root, locks it (owner + ACL) and locks every staging folder', async () => {
    _resetStagingCache()
    const base = mkTmp()
    const root = path.join(base, 'DarkHub-Staging')
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(root, 'planted.exe'), 'evil') // left by someone else: must not survive
    const calls: string[][] = []
    const runIcacls = async (args: string[]) => { calls.push(args); return { code: 0, stdout: '', stderr: '' } }
    const s = await createSecureStagingDir({ root, prefix: 'setup-', elevated: true, platform: 'win32', runIcacls })
    expect(s.secure).toBe(true)
    expect(path.dirname(s.dir)).toBe(root)
    expect(fs.existsSync(path.join(root, 'planted.exe'))).toBe(false)
    expect(calls[0]).toEqual(ownerArgs(root))
    expect(calls[1]).toEqual(lockdownArgs(root))
    expect(calls[2]).toEqual(lockdownArgs(s.dir))
    expect(lockdownArgs('X')).toEqual(['X', '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F'])
    // root prepared once per process; each staging folder still gets its own ACL
    const s2 = await createSecureStagingDir({ root, elevated: true, platform: 'win32', runIcacls })
    expect(calls.length).toBe(4)
    expect(calls[3]).toEqual(lockdownArgs(s2.dir))
    await s.cleanup(); await s2.cleanup()
    expect(fs.existsSync(s.dir)).toBe(false)
  })

  it('elevated: an icacls failure is an error, never a silent fallback', async () => {
    _resetStagingCache()
    const root = path.join(mkTmp(), 'DarkHub-Staging')
    await expect(createSecureStagingDir({ root, fallbackBase: mkTmp(), elevated: true, platform: 'win32', runIcacls: async () => ({ code: 5, stdout: '', stderr: 'Acesso negado' }) })).rejects.toThrow(/proteger/)
  })

  it('not elevated: private folder under the fallback, or an error without one', async () => {
    _resetStagingCache()
    const fb = mkTmp()
    const s = await createSecureStagingDir({ fallbackBase: fb, elevated: false, platform: 'win32', runIcacls: async () => { throw new Error('not called') } })
    expect(s.secure).toBe(false)
    expect(s.dir.startsWith(fb)).toBe(true)
    await expect(createSecureStagingDir({ elevated: false, platform: 'win32' })).rejects.toThrow(/administrador/)
  })

  it('names stay inside the folder, files are created fresh and re-checked before use', async () => {
    _resetStagingCache()
    const s = await createSecureStagingDir({ fallbackBase: mkTmp(), elevated: false, platform: 'win32' })
    expect(() => s.file(process.platform === 'win32' ? '..\\x.exe' : '../x.exe')).toThrow()
    expect(() => s.file('a/b.exe')).toThrow()
    const f = await writeStagedFile(s, 'setup.msi', 'payload')
    await expect(writeStagedFile(s, 'setup.msi', 'again')).rejects.toThrow() // never replaces
    const sha = sha256FileSync(f)
    expect(() => assertUnchanged(f, sha)).not.toThrow()
    fs.writeFileSync(f, 'swapped')
    expect(() => assertUnchanged(f, sha)).toThrow(/mudou/)
  })

  it('the default root sits directly under ProgramData', () => {
    expect(defaultStagingRoot({ ProgramData: 'D:\\PD' })).toBe('D:\\PD\\DarkHub-Staging')
  })
})

describe('host validation (ping/tracert/port scan)', () => {
  it('accepts hostnames and IPs, refuses options, shell and whitespace', () => {
    for (const h of ['1.1.1.1', 'example.com', 'my_host.local', '2606:4700:4700::1111', ' 8.8.8.8 ']) expect(isSafeHost(h)).toBe(true)
    expect(safeHost(' 8.8.8.8 ')).toBe('8.8.8.8')
    for (const h of ['-t', '-n', '-n 100 host', '--help', '1.1.1.1 & calc', 'a b', 'a\tb', 'x\u0000', '/?', 'a|b', '"x"', '', '.', '.hidden', 'a'.repeat(254), null, undefined, {}]) {
      expect(isSafeHost(h as any)).toBe(false)
    }
    expect(() => assertSafeHost('-t')).toThrow(/Host inválido/)
    // every caller uses the same rule
    expect(() => netLatencyAssert('-w 1')).toThrow()
  })
  it('no copy of the old regex is left in the IPC layer', () => {
    for (const f of ['electron/networkIPC.js', 'electron/main.js', 'electron/latencyGuardian.js']) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')
      expect(src).not.toMatch(/\/\^\[A-Za-z0-9_\.:-\]\{1,253\}\$\//)
    }
  })
})

describe('extension updates never widen permissions silently', () => {
  const prev = { id: 'ana.ext', permissions: ['sensors', 'network'], network: ['https://api.a.com'] }
  it('computes what is new', () => {
    expect(permissionGrowth(prev, { permissions: ['sensors'], network: [] })).toEqual({ permissions: [], network: [] })
    expect(hasGrowth(permissionGrowth(prev, prev))).toBe(false)
    expect(permissionGrowth(prev, { permissions: ['sensors', 'clipboard', 'network'], network: ['https://api.a.com', 'https://evil.com'] }))
      .toEqual({ permissions: ['clipboard'], network: ['https://evil.com'] })
    expect(permissionGrowth(null, { permissions: ['x'] })).toEqual({ permissions: ['x'], network: [] })
  })
  it('asks the user; without a yes the installed version stays', async () => {
    const next = { id: 'ana.ext', permissions: ['sensors', 'network', 'clipboard'], network: ['https://api.a.com'] }
    const asked: any[] = []
    expect(await approveGrowth({ approve: async (r: any) => { asked.push(r); return false }, prevPkg: prev, nextPkg: next, preview: null })).toMatchObject({ ok: false, code: 'permissions_changed', added: { permissions: ['clipboard'] } })
    expect(asked[0].title).toContain('clipboard')
    expect(await approveGrowth({ approve: async () => true, prevPkg: prev, nextPkg: next })).toBeNull()
    expect(await approveGrowth({ approve: null, prevPkg: prev, nextPkg: next })).toMatchObject({ code: 'permissions_changed' })
    // a subset needs no question
    let called = false
    expect(await approveGrowth({ approve: async () => { called = true; return false }, prevPkg: prev, nextPkg: { permissions: ['sensors'] } })).toBeNull()
    expect(called).toBe(false)
  })
})

describe('development extension folders', () => {
  it('accept local drives only (no UNC, device or relative paths)', () => {
    expect(isLocalFolderPath('C:\\dev\\ext')).toBe(true)
    expect(isLocalFolderPath('D:/dev/ext')).toBe(true)
    for (const p of ['\\\\server\\share\\ext', '//server/share', '\\\\?\\C:\\dev', '\\\\.\\C:\\dev', 'dev\\ext', 'C:', '', 'C:\\a\u0000b']) expect(isLocalFolderPath(p)).toBe(false)
  })
})

describe('native helper integrity coverage', () => {
  it('the generator lists every shipped exe/dll under electron/services, in any subfolder', () => {
    const listed = new Set(listBinaries())
    const onDisk: string[] = []
    const walk = (rel: string) => {
      const dir = path.resolve(__dirname, '../electron/services', rel)
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name
        // fsr4_rdna2/ stays in the repo for dev but is not packaged (downloaded on demand, see package.json build.files)
        if (e.isDirectory()) { if (r !== 'fsr4_rdna2') walk(r) }
        else if (/\.(exe|dll)$/i.test(e.name)) onDisk.push(r)
      }
    }
    walk('')
    for (const f of onDisk) expect(listed.has(f), f).toBe(true)
    for (const f of ['DarkHub.PacerHook.x64.dll', 'DarkHub.PacerHook.x86.dll', 'DarkHub.PacerInject.x86.exe', 'DarkHub.Cleaner.exe', 'DarkHub.DiskRescue.exe',
      'DarkHub.LatencyEngine.exe', 'DarkHub.FrameLimiter.exe', 'DarkHub.ClickEngine.exe', 'DarkHub.SensorDaemon.exe', 'DarkHub.DiskScan.exe', 'DarkHub.HotkeyWatch.exe',
      'DarkHub.VaultBridgeHost.exe', 'DarkHub.Mcp.exe', 'DarkHub.GpuBench.exe', 'hwsensors/DarkHub.HwSensors.exe', 'lowlatency/VkLayer_KORTHOS_LowLatency.dll']) {
      expect(listed.has(f), f).toBe(true)
    }
    expect(Object.keys(collect()).sort()).toEqual([...listed].sort())
  })
  it('every launch site checks the manifest first', () => {
    const sites: Record<string, string> = {
      'electron/hal/collectors/FastSensorDaemon.js': 'DarkHub.SensorDaemon.exe',
      'electron/hal/collectors/HwSensorsDaemon.js': 'hwsensors/',
      'electron/services/cleaner/CleanerService.js': 'DarkHub.Cleaner.exe',
      'electron/services/diskscan/DiskScanService.js': 'DarkHub.DiskScan.exe',
      'electron/services/recovery/DiskRecoveryService.js': 'DarkHub.DiskRescue.exe',
      'electron/services/autoclicker/AutoClickerService.js': 'DarkHub.ClickEngine.exe',
      'electron/services/FramePacerEngine.js': 'DarkHub.PacerInject.x86.exe',
      'electron/services/hotkeys/HotkeyService.js': 'DarkHub.HotkeyWatch.exe',
      'electron/services/NativeLatencyClient.js': 'DarkHub.LatencyEngine.exe',
      'electron/services/vaultBridge/nativeHost.js': 'HOST_EXE_NAME',
      'electron/services/gpubench/GpuBenchService.js': 'DarkHub.GpuBench.exe',
      'electron/optiscalerManager.js': 'fsr4_rdna2/'
    }
    for (const [file, name] of Object.entries(sites)) {
      const src = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8')
      expect(src, file).toMatch(/integrityError|integrityCheck|checkIntegrity/)
      expect(src, file).toContain(name)
    }
  })
})

describe('DLL injector targets', () => {
  it('refuses Windows protected processes and anti-cheat, allows ordinary ones', () => {
    for (const p of ['csrss', 'lsass.exe', 'WININIT', 'smss', 'services', 'winlogon', 'System', 'EasyAntiCheat.exe', 'BEService', 'vgc', 'FACEIT', 'EasyAntiCheat_EOS', 'some_anticheat', '']) {
      expect(injectTargetRefusal(p), p).not.toBeNull()
    }
    expect(injectTargetRefusal('a\\b')).not.toBeNull()
    for (const p of ['notepad', 'hl2.exe', 'game-Win64-Shipping.exe']) expect(injectTargetRefusal(p), p).toBeNull()
  })
})

describe('recovery words derivation', () => {
  const words = 'abbar acbel adbon albus amcad ancal arcan ascar becel bicen bocer brbar cabel cebon cibus cocad'
  it('v1 stays the truncated hash (old vaults), v2 keeps all 256 bits', () => {
    const v1 = derivePasswordFromRecoveryWords(words)
    expect(v1).toHaveLength(12)
    expect(derivePasswordFromRecoveryWords(words, 1)).toBe(v1)
    const v2 = derivePasswordFromRecoveryWords(words, 2)
    expect(Buffer.from(v2, 'base64')).toHaveLength(32)
    expect(v2.startsWith(v1)).toBe(true)
    expect(derivePasswordFromRecoveryWords(`  ${words.replace(/ /g, '   ')} `, 2)).toBe(v2)
  })
  it('new wrappers are marked v2; old unmarked ones are tried as v1 first, and both open', async () => {
    const key = crypto.randomBytes(32)
    const kdf = { ...buildKdf(), N: 1024 }
    const w2 = await wrapVaultKeyWithRecoveryWords(key, words, kdf)
    expect(w2.derive).toBe(RECOVERY_DERIVE_VERSION)
    expect(recoveryDeriveOrder(w2)).toEqual([2, 1])
    expect((await unwrapVaultKeyWithPassword(w2, derivePasswordFromRecoveryWords(words, 2))).equals(key)).toBe(true)
    const w1 = await wrapVaultKeyWithPassword(key, derivePasswordFromRecoveryWords(words), kdf)
    expect(recoveryDeriveOrder(w1)).toEqual([1, 2])
    expect((await unwrapVaultKeyWithPassword(w1, derivePasswordFromRecoveryWords(words, 1))).equals(key)).toBe(true)
  })
})

describe('elevation without a trusted folder (UAC path)', () => {
  it('writes the .vbs as UTF-16 LE with BOM so cscript keeps accented paths', () => {
    const b = encodeVbs('C:\\Users\\João\\x.ps1')
    expect([...b.subarray(0, 2)]).toEqual([0xff, 0xfe])
    expect(b.subarray(2).toString('utf16le')).toBe('C:\\Users\\João\\x.ps1')
  })
  it('the elevated bootstrap checks the script hash and runs the bytes it checked', () => {
    const s = buildVerifiedBootstrap("C:\\Users\\O'Neil\\a.ps1", 'AB'.repeat(32), { startedFile: 's', errFile: 'e', exitFile: 'x', flagFile: 'f' })
    expect(s).toContain("'C:\\Users\\O''Neil\\a.ps1'")
    expect(s).toContain(`'${'ab'.repeat(32)}'`)
    expect(s).toContain('ReadAllBytes')
    expect(s).toContain('[ScriptBlock]::Create($__dhT)')
    expect(s).not.toMatch(/\s-File\s/)
  })
  it('runs cmd through PowerShell without a batch file and without exit', () => {
    const s = buildCmdRunnerScript('echo "a" & ver')
    expect(s).toContain(`'echo "a" & ver'`)
    expect(s).toContain('$global:LASTEXITCODE')
    expect(s).not.toMatch(/\bexit\b/)
  })
})

describe('Kakugan token store', () => {
  it('reads the saved session lazily, once safeStorage becomes available (after app ready)', () => {
    const file = path.join(mkTmp('dh-kg-'), 'kakugan-session.bin')
    const enc = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`x${s}`), decryptString: (b: Buffer) => b.toString().slice(1) }
    makeTokenStore(file, enc).set('tok')
    let ready = false
    const safe = { ...enc, isEncryptionAvailable: () => ready }
    const store = makeTokenStore(file, safe) // registered before 'ready'
    expect(store.get()).toBeNull()
    ready = true
    expect(store.get()).toBe('tok')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// vault bridge: frames that arrive in one TCP chunk are handled in order

describe('vault bridge frame ordering', { timeout: 20_000 }, () => {
  it('a query sent right behind auth in the same chunk sees the authenticated session', async () => {
    const dir = mkTmp('dh-vb-')
    let cfg: any = null
    const server = new VaultBridgeServer({
      vault: { isUnlocked: () => true, getEntries: () => [{ id: 'e1', site: 'https://example.com', username: 'alice', password: 'p' }], addEntry: async () => {}, updatePassword: async () => {} },
      prompts: { confirmPairing: async () => true, confirmSave: async () => true },
      pairingStore: new PairingStore({ filePath: path.join(dir, 'pairings.json') }),
      allowedCallers: ALLOWED_CALLERS,
      writeConfig: async (c: any) => { cfg = c }
    })
    await server.start()
    const open = async () => {
      const sock = net.connect({ host: '127.0.0.1', port: cfg.port })
      await new Promise<void>((r, j) => { sock.once('connect', () => r()); sock.once('error', j) })
      const dec = new FrameDecoder(1024 * 1024)
      const queue: string[] = []
      const waiters: Array<(f: string) => void> = []
      sock.on('data', (c) => { for (const f of dec.push(c)) { const w = waiters.shift(); if (w) w(f); else queue.push(f) } })
      const next = () => (queue.length ? Promise.resolve(queue.shift() as string) : new Promise<string>((r) => waiters.push(r)))
      const nonceH = crypto.randomBytes(16).toString('hex')
      sock.write(encodeFrame(`DHVB1 H ${nonceH} ${Buffer.from([`chrome-extension://${CHROMIUM_EXTENSION_ID}/`, '--parent-window=0'].join('\n')).toString('base64')}`))
      const [, , nonceS, mac] = (await next()).split(' ')
      expect(mac).toBe(hmacHex(cfg.secret, `S|${nonceH}|${nonceS}`))
      sock.write(encodeFrame(buildClientProof(cfg.secret, nonceH, nonceS)))
      expect(JSON.parse(await next()).type).toBe('bridge.ready')
      return { sock, next }
    }
    try {
      const a = await open()
      a.sock.write(encodeFrame(JSON.stringify({ id: 1, type: 'pair.request', clientName: 'Chrome', browser: 'chrome' })))
      expect(JSON.parse(await a.next())).toMatchObject({ ok: true, pending: true })
      const paired = JSON.parse(await a.next())
      expect(paired).toMatchObject({ type: 'pair.result', ok: true })
      a.sock.destroy()

      const b = await open()
      const chunk = Buffer.concat([
        encodeFrame(JSON.stringify({ id: 1, type: 'auth', clientId: paired.clientId, token: paired.token })),
        encodeFrame(JSON.stringify({ id: 2, type: 'logins.query', url: 'https://example.com/login' }))
      ])
      b.sock.write(chunk)
      const r1 = JSON.parse(await b.next())
      const r2 = JSON.parse(await b.next())
      expect(r1).toMatchObject({ id: 1, ok: true })
      expect(r2).toMatchObject({ id: 2, ok: true })
      expect(r2.logins).toHaveLength(1)
      b.sock.destroy()
    } finally {
      await server.stop()
    }
  })
})
