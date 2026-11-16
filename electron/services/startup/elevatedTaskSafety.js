// A scheduled task with "run with highest privileges" starts the program as administrator, with no UAC prompt, at
// every logon. If a normal user (or any program running as that user) can write to the program's file or folder, it can
// swap the program and get administrator rights silently. This reads the ACLs of what the task would run and lists who,
// besides SYSTEM, Administrators and TrustedInstaller, can write there. Read-only, no elevation.
import fs from 'node:fs'
import path from 'node:path'
import { runPowerShell } from '../PowerShellRunner.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'

/** Files and folders whose replacement would change what the elevated task runs. */
export function elevatedTaskTargets(exePath, exists = fs.existsSync) {
  const dir = path.win32.dirname(exePath)
  const res = path.win32.join(dir, 'resources')
  return [exePath, dir, res, path.win32.join(res, 'app.asar')].filter((p, i) => i < 2 || exists(p))
}

// Rights that let someone change the object: write/append data, write attributes/EA, delete, delete child, change
// permissions or owner, generic write/all. Inherit-only entries do not apply to the object itself and are skipped.
export const UNTRUSTED_WRITERS_SCRIPT = (targets) => String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$trusted = @('S-1-5-18', 'S-1-5-32-544', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
$mask = 0x2 -bor 0x4 -bor 0x10 -bor 0x40 -bor 0x100 -bor 0x10000 -bor 0x40000 -bor 0x80000 -bor 0x10000000 -bor 0x40000000
foreach ($p in @(${targets.map(psQuote).join(', ')})) {
  if (-not (Test-Path -LiteralPath $p)) { continue }
  $acl = Get-Acl -LiteralPath $p
  if (-not $acl) { Write-Output ('DHW|' + $p + '|(unreadable)'); continue }
  foreach ($r in $acl.Access) {
    if ([string]$r.AccessControlType -ne 'Allow') { continue }
    if (([int]$r.PropagationFlags -band 2) -ne 0) { continue }
    if (([int64]$r.FileSystemRights -band $mask) -eq 0) { continue }
    $sid = try { $r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$r.IdentityReference }
    if ($trusted -contains $sid) { continue }
    Write-Output ('DHW|' + $p + '|' + [string]$r.IdentityReference)
  }
}
Write-Output 'DHW-END'
`

/** DHW|path|who lines -> [{ path, who }]; null when the script did not finish (treated as unsafe by callers). */
export function parseUntrustedWriters(stdout) {
  const text = String(stdout || '')
  if (!text.includes('DHW-END')) return null
  const out = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^DHW\|(.+)\|(.+)$/.exec(line.trim())
    if (m) out.push({ path: m[1], who: m[2] })
  }
  return out
}

/** Who can change what an elevated task would run. [] = safe; null = could not check (treat as unsafe). */
export async function findUntrustedWriters(exePath) {
  if (process.platform !== 'win32' || !exePath) return null
  try {
    const r = await runPowerShell(UNTRUSTED_WRITERS_SCRIPT(elevatedTaskTargets(exePath)), { timeoutMs: 20000, trim: true })
    return parseUntrustedWriters(r.stdout)
  } catch {
    return null
  }
}

/** User-facing reason (pt-BR, like the other backend messages) for refusing an elevated autostart. */
export function unsafeFolderMessage(exePath, writers) {
  const who = writers?.length ? [...new Set(writers.map((w) => w.who))].slice(0, 3).join(', ') : ''
  return `O DarkHub está em uma pasta que outros programas podem alterar (${path.win32.dirname(exePath)}${who ? `; podem gravar: ${who}` : ''}). `
    + 'Iniciar com o Windows usaria permissão de administrador sem confirmação, e um programa malicioso poderia trocar o DarkHub e ganhar esse acesso. '
    + 'Use o instalador (instala em Arquivos de Programas) ou mova a pasta para um local protegido e ative de novo.'
}
