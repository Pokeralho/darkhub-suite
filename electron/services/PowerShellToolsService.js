// PowerShell advanced tools (DarkOS iteration 2).
//
// Read-only by default: shows the effective execution policy per scope and explains it. It can run
// ONLY trusted DarkOS maintenance scripts (validated to live under C:\ProgramData\DarkOS) and can
// open an elevated terminal. It NEVER changes the machine/user execution policy: scripts run with
// `-ExecutionPolicy Bypass` scoped to the single child process it spawns.
//
// No `electron` import at module scope (pure helpers are unit-testable); PowerShell access and fs
// are injected and default to the shared runners / node:fs.

import fsDefault from 'node:fs'
import path from 'node:path'
import { runPowerShell, runCommand, parseJsonOutput } from './PowerShellRunner.js'

export const DARKOS_ROOT = 'C:\\ProgramData\\DarkOS'

/** Precedence order Windows uses to pick the effective policy (highest priority first). */
export const POLICY_PRECEDENCE = Object.freeze(['MachinePolicy', 'UserPolicy', 'Process', 'CurrentUser', 'LocalMachine'])

export function isPs1(p) {
  return typeof p === 'string' && /\.ps1$/i.test(p.trim())
}

/** True only when `p` is a real descendant of the DarkOS root (no traversal, not the root itself). */
export function isUnderDarkOS(p, root = DARKOS_ROOT) {
  if (typeof p !== 'string' || !p.trim()) return false
  try {
    const target = path.win32.resolve(p.trim())
    const base = path.win32.resolve(root)
    const rel = path.win32.relative(base, target)
    if (!rel || rel === '.') return false
    return !rel.startsWith('..') && !path.win32.isAbsolute(rel)
  } catch {
    return false
  }
}

/** Normalizes the parsed `Get-ExecutionPolicy -List` output into [{ scope, policy }]. */
export function normalizeScopes(data) {
  const list = Array.isArray(data) ? data : (data ? [data] : [])
  return list
    .map((d) => ({ scope: String(d?.scope ?? d?.Scope ?? '').trim(), policy: String(d?.policy ?? d?.ExecutionPolicy ?? '').trim() }))
    .filter((d) => d.scope)
}

/** The effective policy = first scope (by precedence) that is set to something other than Undefined. */
export function effectivePolicy(scopes = []) {
  for (const scope of POLICY_PRECEDENCE) {
    const found = scopes.find((s) => s.scope === scope)
    if (found && found.policy && found.policy !== 'Undefined') return { scope, policy: found.policy }
  }
  // When every scope is Undefined, Windows clients default to Restricted.
  return { scope: 'Default', policy: 'Restricted' }
}

/** Compresses an Authenticode result into a small, display-friendly shape. */
export function normalizeSignature(sig) {
  if (!sig) return { status: 'Unknown', trusted: false, signer: '' }
  const status = String(sig.status ?? sig.Status ?? 'Unknown').trim() || 'Unknown'
  return { status, trusted: status === 'Valid', signer: String(sig.signer ?? '').trim() }
}

function psQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

export class PowerShellToolsService {
  constructor({ runner, cmdRunner, fsImpl, root } = {}) {
    this._root = root || DARKOS_ROOT
    this._fs = fsImpl || fsDefault
    this._runner = runner || ((script, opts) => runPowerShell(script, opts))
    this._cmd = cmdRunner || ((cmd, args, opts) => runCommand(cmd, args, opts))
  }

  /** Reads the execution policy of every scope and resolves the effective one (no admin needed). */
  async getPolicies() {
    if (process.platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.', scopes: [] }
    const script = `Get-ExecutionPolicy -List | ForEach-Object { [pscustomobject]@{ scope = $_.Scope.ToString(); policy = $_.ExecutionPolicy.ToString() } } | ConvertTo-Json -Compress`
    const res = await this._runner(script, { timeoutMs: 15000, trim: true })
    const scopes = normalizeScopes(parseJsonOutput(res?.stdout, []))
    if (!scopes.length) return { ok: false, error: (res?.stderr || '').trim() || 'Não foi possível ler a política de execução.', scopes: [] }
    return { ok: true, scopes, effective: effectivePolicy(scopes) }
  }

  /** Lists the trusted .ps1 maintenance scripts under the DarkOS root, each with its signature. */
  async listScripts() {
    if (!this._fs.existsSync(this._root)) {
      return { ok: true, rootExists: false, root: this._root, scripts: [] }
    }
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$root = ${psQuote(this._root)}
$files = Get-ChildItem -Path $root -Recurse -Filter *.ps1 -File -ErrorAction SilentlyContinue | Select-Object -First 200
$out = foreach ($f in $files) {
  $sig = Get-AuthenticodeSignature -FilePath $f.FullName -ErrorAction SilentlyContinue
  [pscustomobject]@{
    name = $f.Name
    path = $f.FullName
    sizeBytes = [int64]$f.Length
    modified = $f.LastWriteTimeUtc.ToString('o')
    status = if ($sig) { "$($sig.Status)" } else { 'Unknown' }
    signer = if ($sig -and $sig.SignerCertificate) { "$($sig.SignerCertificate.Subject)" } else { '' }
  }
}
ConvertTo-Json -InputObject @($out) -Depth 3 -Compress
`
    const res = await this._runner(script, { timeoutMs: 30000, trim: true })
    const raw = parseJsonOutput(res?.stdout, [])
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    const scripts = list.map((s) => ({
      name: String(s.name ?? ''),
      path: String(s.path ?? ''),
      sizeBytes: Number(s.sizeBytes ?? 0) || 0,
      modified: String(s.modified ?? ''),
      signature: normalizeSignature({ status: s.status, signer: s.signer })
    }))
    return { ok: true, rootExists: true, root: this._root, scripts }
  }

  /** Returns the Authenticode signature of a single trusted script (validated path). */
  async getSignature(scriptPath) {
    if (!isPs1(scriptPath) || !isUnderDarkOS(scriptPath, this._root)) {
      return { ok: false, error: 'Caminho inválido ou fora de ' + this._root }
    }
    if (!this._fs.existsSync(scriptPath)) return { ok: false, error: 'Arquivo não encontrado.' }
    const script = `$s = Get-AuthenticodeSignature -FilePath ${psQuote(scriptPath)} -ErrorAction SilentlyContinue; [pscustomobject]@{ status = "$($s.Status)"; signer = if ($s.SignerCertificate) { "$($s.SignerCertificate.Subject)" } else { '' } } | ConvertTo-Json -Compress`
    const res = await this._runner(script, { timeoutMs: 15000, trim: true })
    const d = parseJsonOutput(res?.stdout, null)
    return { ok: true, signature: normalizeSignature(d || {}) }
  }

  /**
   * Runs a trusted DarkOS maintenance script. Refuses anything outside C:\ProgramData\DarkOS.
   * Uses `-ExecutionPolicy Bypass` scoped to this child process only — the system policy is untouched.
   * The caller (UI) sees the signature so an unsigned script is never run without the user seeing it.
   */
  async runScript({ path: scriptPath } = {}) {
    if (!isPs1(scriptPath)) return { ok: false, error: 'Selecione um arquivo .ps1.' }
    if (!isUnderDarkOS(scriptPath, this._root)) {
      return { ok: false, error: `Por segurança, só é possível executar scripts dentro de ${this._root}.` }
    }
    if (!this._fs.existsSync(scriptPath)) return { ok: false, error: 'Arquivo não encontrado.' }
    const sig = await this.getSignature(scriptPath)
    const res = await this._cmd('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-File', scriptPath
    ], { timeoutMs: 120000, trim: true })
    const stdout = String(res?.stdout ?? '')
    const stderr = String(res?.stderr ?? '')
    return {
      ok: res?.code === 0,
      code: res?.code ?? 1,
      stdout,
      stderr,
      signature: sig.ok ? sig.signature : { status: 'Unknown', trusted: false, signer: '' },
      error: res?.code === 0 ? undefined : (stderr.trim() || `O script terminou com código ${res?.code}.`)
    }
  }

  /**
   * Opens a real elevated PowerShell window (UAC prompt) at the DarkOS root. If the user cancels the
   * UAC prompt, Start-Process throws and this returns ok:false.
   */
  async openElevatedTerminal({ startingPath } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' }
    let startIn = this._root
    if (startingPath && isUnderDarkOS(startingPath, this._root) && this._fs.existsSync(startingPath)) startIn = startingPath
    if (!this._fs.existsSync(startIn)) startIn = process.env.SystemRoot || 'C:\\'
    const inner = `Set-Location -LiteralPath ${psQuote(startIn)}`
    const launcher = `try { Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoExit','-NoProfile','-Command',${psQuote(inner)}); 'DH_LAUNCHED' } catch { Write-Error $_.Exception.Message; exit 1 }`
    const res = await this._cmd('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcher], { timeoutMs: 20000, trim: true })
    const launched = res?.code === 0 && String(res?.stdout ?? '').includes('DH_LAUNCHED')
    return launched
      ? { ok: true }
      : { ok: false, error: (String(res?.stderr ?? '').trim()) || 'UAC cancelado ou falha ao abrir o terminal elevado.' }
  }
}

export default PowerShellToolsService
