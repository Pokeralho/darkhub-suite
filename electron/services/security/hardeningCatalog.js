// Windows hardening toggles for Advanced Security. Each item snapshots the exact previous state inside the same
// elevated script that changes it (DHSNAP line), so Restore puts back what was there, not a guessed default.
// Pure module: builds PowerShell (ASCII only) and judges status from the read-only status JSON.
import {
  psQuote, buildRegistryReadScript, buildRegistryScript, parseRegistryReadOutput, regValueMatches, snapshotEntryToOps, regEntryId
} from '../optimizer/OptimizerUtils.js';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NETBT_IFACE_RE = /^Tcpip_\{[0-9a-f-]{36}\}$/i;
const NETBT_KEY = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces';
const LLMNR_KEY = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient';

/**
 * Attack Surface Reduction rules (Microsoft's documented GUIDs). Left out on purpose: the prevalence/age rule,
 * PSExec/WMI process creation, Safe Mode reboot and copied system tools, which break legitimate software too often.
 */
export const ASR_RULES = Object.freeze([
  { id: '56a863a9-875e-4185-98a7-b882c64b5ce5', name: 'Block abuse of exploited vulnerable signed drivers' },
  { id: '9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2', name: 'Block credential stealing from LSASS' },
  { id: 'e6db77e5-3df2-4cf1-b95a-636979351e5b', name: 'Block persistence through WMI event subscription' },
  { id: 'be9ba2d9-53ea-4cdc-84e5-9b1eeee46550', name: 'Block executable content from email client and webmail' },
  { id: 'd4f940ab-401b-4efc-aadc-ad5f3c50688a', name: 'Block Office applications from creating child processes' },
  { id: '3b576869-a4ec-4529-8536-b80a7769e899', name: 'Block Office applications from creating executable content' },
  { id: '75668c1f-73b5-4cf0-bb93-3ecf5cb7cc84', name: 'Block Office applications from injecting code into other processes' },
  { id: '92e97fa1-2edf-4476-bdd6-9dd0b4dddc7b', name: 'Block Win32 API calls from Office macros' },
  { id: '26190899-1602-49e8-8b27-eb1d0a1ce869', name: 'Block Office communication apps from creating child processes' },
  { id: '7674ba52-37eb-4a4f-a9a1-f0f9a1619a2c', name: 'Block Adobe Reader from creating child processes' },
  { id: 'd3e037e1-3eb8-44c8-a917-57927947596d', name: 'Block JavaScript or VBScript from launching downloaded executable content' },
  { id: '5beb7efe-fd9a-4556-801d-275e5ffc04cc', name: 'Block execution of potentially obfuscated scripts' },
  { id: 'b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4', name: 'Block untrusted and unsigned processes that run from USB' },
  { id: 'c1db55ab-c21a-4637-bb3f-a12568109d35', name: 'Use advanced protection against ransomware' }
]);
export const ASR_ACTION = Object.freeze({ disabled: 0, block: 1, audit: 2, warn: 6 });

const REGISTRY_ITEMS = {
  smartscreen: [
    { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'EnableSmartScreen', type: 'REG_DWORD', data: 1 },
    { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'ShellSmartScreenLevel', type: 'REG_SZ', data: 'Warn' },
    { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'SmartScreenEnabled', type: 'REG_DWORD', data: 1 }
  ],
  psLogging: [
    { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging', name: 'EnableScriptBlockLogging', type: 'REG_DWORD', data: 1 }
  ],
  rdpOff: [
    { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server', name: 'fDenyTSConnections', type: 'REG_DWORD', data: 1 }
  ]
};

/** id, group, whether Microsoft Defender must be the active AV, and UI hints (no strings: the screen translates by id). */
export const HARDENING_ITEMS = Object.freeze([
  { id: 'asr', group: 'defender', requiresDefender: true, hasMode: true },
  { id: 'pua', group: 'defender', requiresDefender: true },
  { id: 'cfa', group: 'defender', requiresDefender: true, warning: true },
  { id: 'smartscreen', group: 'system', kind: 'registry' },
  { id: 'smb1', group: 'network', reboot: true },
  { id: 'llmnrNetbios', group: 'network' },
  { id: 'psLogging', group: 'system', kind: 'registry' },
  { id: 'rdpOff', group: 'network', kind: 'registry', warning: true }
]);

export function getHardeningItem(id) {
  return HARDENING_ITEMS.find((i) => i.id === id) || null;
}

const allRegistryEntries = () => Object.values(REGISTRY_ITEMS).flat();

// ------------------------------------------------------------------ status (read-only)

/** Read-only status script: Defender, ASR, PUA, CFA, SMBv1, LLMNR, NetBIOS and the registry values, as one JSON object. */
export function buildHardeningStatusScript() {
  const regRead = buildRegistryReadScript([...allRegistryEntries(), { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', name: 'EnableMulticast' }]);
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    '$mp = $null; try { $mp = Get-MpPreference -ErrorAction Stop } catch {}',
    '$ms = $null; try { $ms = Get-MpComputerStatus -ErrorAction Stop } catch {}',
    '$srv = $null; try { $srv = [bool](Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol } catch {}',
    '$feat = $null; try { $feat = [string](Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop).State } catch {}',
    "$cli = Get-ItemProperty -LiteralPath 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10' -ErrorAction SilentlyContinue",
    `$ifs = @(Get-ChildItem -LiteralPath ${psQuote(NETBT_KEY)} -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue; [pscustomobject]@{ name = $_.PSChildName; value = $p.NetbiosOptions } })`,
    `$reg = & { ${regRead.split('\r\n').join('\r\n')} }`,
    '[pscustomobject]@{',
    '  defender = [pscustomobject]@{ available = ($null -ne $mp); mode = [string]$ms.AMRunningMode; antivirus = [bool]$ms.AntivirusEnabled; realtime = [bool]$ms.RealTimeProtectionEnabled; tamper = [bool]$ms.IsTamperProtected }',
    "  asr = [pscustomobject]@{ ids = @($mp.AttackSurfaceReductionRules_Ids | ForEach-Object { ([string]$_).ToLowerInvariant() }); actions = @($mp.AttackSurfaceReductionRules_Actions | ForEach-Object { [int]$_ }) }",
    '  pua = if ($mp) { [int]$mp.PUAProtection } else { $null }',
    '  cfa = if ($mp) { [int]$mp.EnableControlledFolderAccess } else { $null }',
    '  smb1 = [pscustomobject]@{ server = $srv; feature = $feat; clientDriver = ($null -ne $cli); clientStart = if ($cli) { [int]$cli.Start } else { $null } }',
    '  netbios = $ifs',
    '  registry = $reg',
    '} | ConvertTo-Json -Compress -Depth 5'
  ].join('\r\n');
}

/** Is Microsoft Defender the active antivirus (not passive behind a third-party AV)? */
export function defenderActive(status) {
  const d = status?.defender;
  if (!d?.available) return false;
  if (d.mode) return /^normal$/i.test(d.mode);
  return d.antivirus === true;
}

function registryMap(status) {
  const raw = status?.registry;
  return parseRegistryReadOutput(typeof raw === 'string' ? raw : JSON.stringify(raw ?? []));
}

function asrState(status) {
  const ids = (status?.asr?.ids || []).map((x) => String(x).toLowerCase());
  const actions = status?.asr?.actions || [];
  const byId = new Map(ids.map((id, i) => [id, Number(actions[i])]));
  const ours = ASR_RULES.map((r) => byId.get(r.id));
  const count = (a) => ours.filter((x) => x === a).length;
  const block = count(ASR_ACTION.block);
  const audit = count(ASR_ACTION.audit);
  const mode = block === ASR_RULES.length ? 'block' : audit === ASR_RULES.length ? 'audit' : block + audit > 0 ? 'partial' : 'off';
  return { mode, block, audit, total: ASR_RULES.length };
}

/** Per item: { id, available, applied, detail } judged from the status JSON. */
export function evaluateHardening(status) {
  const reg = registryMap(status);
  const regApplied = (id) => REGISTRY_ITEMS[id].every((c) => regValueMatches(c, reg.get(regEntryId(c.key, c.name))));
  const def = defenderActive(status);
  const out = {};
  for (const item of HARDENING_ITEMS) {
    let applied = false;
    let detail = null;
    const available = item.requiresDefender ? def : true;
    switch (item.id) {
      case 'asr': detail = asrState(status); applied = detail.mode === 'block' || detail.mode === 'audit'; break;
      case 'pua': applied = status?.pua === 1; detail = { value: status?.pua ?? null }; break;
      case 'cfa': applied = status?.cfa === 1; detail = { value: status?.cfa ?? null }; break;
      case 'smb1': {
        const s = status?.smb1 || {};
        const clientOn = s.clientDriver === true && s.clientStart !== 4;
        applied = s.server !== true && s.feature !== 'Enabled' && !clientOn;
        detail = { server: s.server ?? null, feature: s.feature ?? null, clientDriver: clientOn };
        break;
      }
      case 'llmnrNetbios': {
        const llmnr = reg.get(regEntryId('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'EnableMulticast'));
        const llmnrOff = Boolean(llmnr?.exists) && Number(llmnr.value) === 0;
        const ifs = Array.isArray(status?.netbios) ? status.netbios : status?.netbios ? [status.netbios] : [];
        const nbOff = ifs.every((i) => Number(i?.value) === 2);
        applied = llmnrOff && nbOff;
        detail = { llmnrOff, netbiosOff: nbOff, interfaces: ifs.length };
        break;
      }
      default: applied = regApplied(item.id);
    }
    out[item.id] = { id: item.id, available, applied, detail };
  }
  return out;
}

// ------------------------------------------------------------------ apply / restore

const DEFENDER_GUARD = "$s = Get-MpComputerStatus -ErrorAction Stop; if ($s.AMRunningMode -and ([string]$s.AMRunningMode) -ne 'Normal') { throw 'Microsoft Defender is not the active antivirus' }";

function regSnapshotPs(id) {
  const script = buildRegistryReadScript(REGISTRY_ITEMS[id]);
  return `$__snap = & {\r\n${script}\r\n}\r\nWrite-Output ('DHSNAP|${id}|' + $__snap)`;
}

/**
 * Elevated script (to be wrapped by wrapMarkedScript) that prints DHSNAP|<id>|<json> with the previous state and
 * then applies the hardening. options.mode: 'audit' | 'block' (ASR only).
 */
export function buildHardeningApplyScript(id, options = {}) {
  switch (id) {
    case 'asr': {
      const action = options.mode === 'block' ? ASR_ACTION.block : ASR_ACTION.audit;
      return [
        DEFENDER_GUARD,
        '$mp = Get-MpPreference -ErrorAction Stop',
        "$snap = [pscustomobject]@{ ids = @($mp.AttackSurfaceReductionRules_Ids | ForEach-Object { ([string]$_).ToLowerInvariant() }); actions = @($mp.AttackSurfaceReductionRules_Actions | ForEach-Object { [int]$_ }) }",
        "Write-Output ('DHSNAP|asr|' + ($snap | ConvertTo-Json -Compress))",
        `$ids = [string[]]@(${ASR_RULES.map((r) => `'${r.id}'`).join(',')})`,
        `$acts = @($ids | ForEach-Object { ${action} })`,
        'Add-MpPreference -AttackSurfaceReductionRules_Ids $ids -AttackSurfaceReductionRules_Actions $acts -ErrorAction Stop'
      ].join('\r\n');
    }
    case 'pua':
      return [
        DEFENDER_GUARD,
        "Write-Output ('DHSNAP|pua|' + ([pscustomobject]@{ value = [int](Get-MpPreference -ErrorAction Stop).PUAProtection } | ConvertTo-Json -Compress))",
        'Set-MpPreference -PUAProtection 1 -ErrorAction Stop'
      ].join('\r\n');
    case 'cfa':
      return [
        DEFENDER_GUARD,
        "Write-Output ('DHSNAP|cfa|' + ([pscustomobject]@{ value = [int](Get-MpPreference -ErrorAction Stop).EnableControlledFolderAccess } | ConvertTo-Json -Compress))",
        'Set-MpPreference -EnableControlledFolderAccess 1 -ErrorAction Stop'
      ].join('\r\n');
    case 'smb1':
      return [
        '$srv = $null; try { $srv = [bool](Get-SmbServerConfiguration -ErrorAction Stop).EnableSMB1Protocol } catch {}',
        '$feat = $null; try { $feat = [string](Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction Stop).State } catch {}',
        "Write-Output ('DHSNAP|smb1|' + ([pscustomobject]@{ server = $srv; feature = $feat } | ConvertTo-Json -Compress))",
        'if ($srv -ne $false) { Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -Confirm:$false -ErrorAction Stop }',
        "if ($feat -eq 'Enabled') { Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart -ErrorAction Stop | Out-Null }"
      ].join('\r\n');
    case 'llmnrNetbios':
      return [
        `$k = ${psQuote(LLMNR_KEY)}`,
        '$ke = Test-Path -LiteralPath $k',
        '$v = $null; if ($ke) { $v = (Get-ItemProperty -LiteralPath $k -ErrorAction SilentlyContinue).EnableMulticast }',
        `$ifs = @(Get-ChildItem -LiteralPath ${psQuote(NETBT_KEY)} -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue; [pscustomobject]@{ name = $_.PSChildName; value = $p.NetbiosOptions } })`,
        "Write-Output ('DHSNAP|llmnrNetbios|' + ([pscustomobject]@{ llmnrKeyExisted = $ke; llmnr = $v; interfaces = $ifs } | ConvertTo-Json -Compress -Depth 4))",
        'if (-not $ke) { New-Item -Path $k -Force | Out-Null }',
        'New-ItemProperty -LiteralPath $k -Name EnableMulticast -PropertyType DWord -Value 0 -Force | Out-Null',
        `Get-ChildItem -LiteralPath ${psQuote(NETBT_KEY)} -ErrorAction SilentlyContinue | ForEach-Object { New-ItemProperty -LiteralPath $_.PSPath -Name NetbiosOptions -PropertyType DWord -Value 2 -Force | Out-Null }`
      ].join('\r\n');
    default:
      if (!REGISTRY_ITEMS[id]) throw new Error(`unknown hardening item: ${id}`);
      return [regSnapshotPs(id), buildRegistryScript(REGISTRY_ITEMS[id])].join('\r\n');
  }
}

/** Parses a DHSNAP json payload into a validated snapshot object (or null). */
export function parseHardeningSnapshot(id, json) {
  let v;
  try { v = JSON.parse(String(json || '')); } catch { return null; }
  switch (id) {
    case 'asr': {
      const ids = (Array.isArray(v?.ids) ? v.ids : v?.ids ? [v.ids] : []).map((x) => String(x).toLowerCase());
      const acts = (Array.isArray(v?.actions) ? v.actions : v?.actions !== undefined && v?.actions !== null ? [v.actions] : []).map(Number);
      const rules = [];
      ids.forEach((rid, i) => { if (GUID_RE.test(rid) && [0, 1, 2, 6].includes(acts[i])) rules.push({ id: rid, action: acts[i] }); });
      return { rules };
    }
    case 'pua': return Number.isInteger(v?.value) && v.value >= 0 && v.value <= 2 ? { value: v.value } : null;
    case 'cfa': return Number.isInteger(v?.value) && v.value >= 0 && v.value <= 6 ? { value: v.value } : null;
    case 'smb1': return { server: typeof v?.server === 'boolean' ? v.server : null, feature: typeof v?.feature === 'string' ? v.feature : null };
    case 'llmnrNetbios': {
      const ifs = (Array.isArray(v?.interfaces) ? v.interfaces : v?.interfaces ? [v.interfaces] : [])
        .filter((i) => NETBT_IFACE_RE.test(String(i?.name || '')))
        .map((i) => ({ name: String(i.name), value: Number.isInteger(i.value) ? i.value : null }));
      return { llmnrKeyExisted: v?.llmnrKeyExisted === true, llmnr: Number.isInteger(v?.llmnr) ? v.llmnr : null, interfaces: ifs };
    }
    default: {
      if (!REGISTRY_ITEMS[id]) return null;
      const map = parseRegistryReadOutput(JSON.stringify(Array.isArray(v) ? v : [v]));
      const entries = REGISTRY_ITEMS[id].map((c) => {
        const cur = map.get(regEntryId(c.key, c.name));
        return { key: c.key, name: c.name, existed: Boolean(cur?.exists), keyExisted: Boolean(cur?.keyExists), type: cur?.type || c.type, data: cur?.value ?? null };
      });
      return { entries };
    }
  }
}

/** Elevated script that puts back exactly the snapshot taken by buildHardeningApplyScript. */
export function buildHardeningRestoreScript(id, snap) {
  if (!snap) throw new Error('no snapshot');
  switch (id) {
    case 'asr': {
      const prev = new Map((snap.rules || []).map((r) => [r.id, r.action]));
      const lines = [];
      const restoreIds = ASR_RULES.filter((r) => prev.has(r.id));
      const removeIds = ASR_RULES.filter((r) => !prev.has(r.id));
      if (restoreIds.length) {
        lines.push(`Add-MpPreference -AttackSurfaceReductionRules_Ids ([string[]]@(${restoreIds.map((r) => `'${r.id}'`).join(',')})) -AttackSurfaceReductionRules_Actions @(${restoreIds.map((r) => prev.get(r.id)).join(',')}) -ErrorAction Stop`);
      }
      if (removeIds.length) {
        lines.push(`Remove-MpPreference -AttackSurfaceReductionRules_Ids ([string[]]@(${removeIds.map((r) => `'${r.id}'`).join(',')})) -ErrorAction Stop`);
      }
      return lines.join('\r\n');
    }
    case 'pua': return `Set-MpPreference -PUAProtection ${Number(snap.value) | 0} -ErrorAction Stop`;
    case 'cfa': return `Set-MpPreference -EnableControlledFolderAccess ${Number(snap.value) | 0} -ErrorAction Stop`;
    case 'smb1': {
      const lines = [];
      if (snap.feature === 'Enabled') lines.push('Enable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -All -NoRestart -ErrorAction Stop | Out-Null');
      if (snap.server === true) lines.push('Set-SmbServerConfiguration -EnableSMB1Protocol $true -Force -Confirm:$false -ErrorAction Stop');
      return lines.join('\r\n') || "Write-Output 'nothing to restore'";
    }
    case 'llmnrNetbios': {
      const lines = [`$k = ${psQuote(LLMNR_KEY)}`];
      if (snap.llmnr === null) lines.push("if (Test-Path -LiteralPath $k) { Remove-ItemProperty -LiteralPath $k -Name EnableMulticast -ErrorAction SilentlyContinue }");
      else lines.push(`if (-not (Test-Path -LiteralPath $k)) { New-Item -Path $k -Force | Out-Null }`, `New-ItemProperty -LiteralPath $k -Name EnableMulticast -PropertyType DWord -Value ${snap.llmnr | 0} -Force | Out-Null`);
      if (!snap.llmnrKeyExisted) {
        lines.push("$kk = Get-Item -LiteralPath $k -ErrorAction SilentlyContinue; if ($kk -and $kk.ValueCount -eq 0 -and $kk.SubKeyCount -eq 0) { Remove-Item -LiteralPath $k -Force }");
      }
      for (const i of snap.interfaces || []) {
        if (!NETBT_IFACE_RE.test(i.name)) continue;
        const p = psQuote(`${NETBT_KEY}\\${i.name}`);
        lines.push(i.value === null
          ? `if (Test-Path -LiteralPath ${p}) { Remove-ItemProperty -LiteralPath ${p} -Name NetbiosOptions -ErrorAction SilentlyContinue }`
          : `if (Test-Path -LiteralPath ${p}) { New-ItemProperty -LiteralPath ${p} -Name NetbiosOptions -PropertyType DWord -Value ${i.value | 0} -Force | Out-Null }`);
      }
      return lines.join('\r\n');
    }
    default: {
      if (!REGISTRY_ITEMS[id]) throw new Error(`unknown hardening item: ${id}`);
      const ops = (snap.entries || []).flatMap((e) => snapshotEntryToOps(e));
      return buildRegistryScript(ops);
    }
  }
}
