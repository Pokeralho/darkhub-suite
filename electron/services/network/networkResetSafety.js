// What a network stack reset would destroy or interrupt on this PC, read before running it.
// `netsh int ip reset` rewrites the TCP/IP configuration: a fixed IP and DNS servers typed by hand are lost (the adapter
// goes back to DHCP). A remote desktop session or a VPN can drop and not come back by itself. Read-only, no elevation.
import { runPowerShellJson } from '../PowerShellRunner.js'

/** VPN client adapters (OpenVPN, WireGuard, AnyConnect, GlobalProtect, Tailscale...), matched on name and description. */
export const VPN_ADAPTER_PATTERN = /TAP-Windows|Wintun|WireGuard|AnyConnect|OpenVPN|Fortinet|FortiClient|PANGP|GlobalProtect|Juniper|Pulse Secure|Ivanti|SonicWall|Check Point|Zscaler|NordLynx|ProtonVPN|Tailscale|ZeroTier|Hamachi|Cloudflare WARP|Cisco Secure Client/i

// ASCII only. Physical adapters only for IP/DNS: Hyper-V/WSL virtual switches have fixed addresses by design.
export const NETWORK_FACTS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
# WMI instead of the NetAdapter/NetTCPIP cmdlets: those load a CIM module that took 10-20 s on a cold call
$all = @(Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.NetConnectionStatus -eq 2 })
$cfg = @{}
foreach ($c in @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = TRUE')) { $cfg[[string]$c.SettingID] = $c }
$static = @()
$dns = @()
foreach ($a in @($all | Where-Object { $_.PhysicalAdapter })) {
  $g = [string]$a.GUID
  $c = $cfg[$g]
  if ($c -and -not $c.DHCPEnabled) { $static += [string]$a.NetConnectionID }
  $v4 = (Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\' + $g)).NameServer
  $v6 = (Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters\Interfaces\' + $g)).NameServer
  if (([string]$v4).Trim() -or ([string]$v6).Trim()) { $dns += [string]$a.NetConnectionID }
}
$vpn = @()
foreach ($scope in @($false, $true)) {
  $c = if ($scope) { @(Get-VpnConnection -AllUserConnection) } else { @(Get-VpnConnection) }
  foreach ($x in $c) { if ([string]$x.ConnectionStatus -eq 'Connected') { $vpn += [string]$x.Name } }
}
$up = @($all | ForEach-Object { [pscustomobject]@{ name = [string]$_.NetConnectionID; desc = [string]$_.Name } })
[pscustomobject]@{ staticIp = @($static); manualDns = @($dns); vpnConnections = @($vpn); upAdapters = @($up) } | ConvertTo-Json -Compress -Depth 4
`

const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]).filter((x) => x !== null && x !== undefined && String(x).trim() !== '')

/**
 * Pure decision. facts: { rdp, staticIp[], manualDns[], vpnConnections[], upAdapters[{name,desc}] } (null = unreadable).
 * Returns { blocked: string|null, skipIpReset: boolean, notes: string[] }.
 */
export function planNetworkReset(facts) {
  if (!facts) {
    // could not read the configuration: keep the safe part only (winsock + DNS cache), never the TCP/IP rewrite
    return { blocked: null, skipIpReset: true, notes: ['Não foi possível ler a configuração de rede; o reset de TCP/IP foi pulado por segurança (pode apagar IP fixo e DNS manual).'] }
  }
  if (facts.rdp) {
    return { blocked: 'Este PC está sendo usado pela Área de Trabalho Remota: o reset de rede pode deixar a conexão sem volta até alguém reiniciar o PC no local. Faça o reset estando na frente do computador.', skipIpReset: false, notes: [] }
  }
  const vpns = [
    ...list(facts.vpnConnections),
    ...list(facts.upAdapters).filter((a) => VPN_ADAPTER_PATTERN.test(`${a?.name || ''} ${a?.desc || ''}`)).map((a) => a.name)
  ]
  if (vpns.length) {
    return { blocked: `Há uma VPN ligada (${[...new Set(vpns)].join(', ')}). Desconecte a VPN e tente de novo: o reset pode derrubá-la e o cliente de VPN pode precisar ser reconfigurado.`, skipIpReset: false, notes: [] }
  }
  const stat = list(facts.staticIp)
  const dns = list(facts.manualDns)
  const notes = []
  if (stat.length) notes.push(`IP fixo em ${stat.join(', ')}: o reset de TCP/IP foi pulado para não apagar o endereço configurado à mão.`)
  if (dns.length) notes.push(`DNS configurado à mão em ${dns.join(', ')}: o reset de TCP/IP foi pulado para não apagar os servidores DNS.`)
  return { blocked: null, skipIpReset: stat.length > 0 || dns.length > 0, notes }
}

/** Reads the facts (null when PowerShell could not answer). */
export async function readNetworkFacts(env = process.env) {
  const rdp = /^RDP-/i.test(String(env.SESSIONNAME || ''))
  try {
    const r = await runPowerShellJson(NETWORK_FACTS_SCRIPT, { timeoutMs: 45000, trim: true, allowNonZero: true })
    if (!r.data || typeof r.data !== 'object') return rdp ? { rdp } : null
    return { rdp, ...r.data }
  } catch {
    return rdp ? { rdp } : null
  }
}

/** The PowerShell lines of the reset, following the plan (ASCII). */
export function networkResetLines(plan) {
  const lines = ['& ipconfig.exe /flushdns | Out-Null', '& netsh.exe winsock reset']
  if (!plan.skipIpReset) lines.push('& netsh.exe int ip reset | Out-Null')
  return lines
}
