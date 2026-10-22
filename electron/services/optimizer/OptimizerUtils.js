// Pure helpers shared by the optimizer engines. No Electron / no OS access here,
// so everything in this file is unit-testable on any platform.

/** PowerShell single-quoted literal (safe for any string). */
export function psQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}

export const HIVES = {
  HKCU: { ps: 'CurrentUser', native: 'HKEY_CURRENT_USER' },
  HKLM: { ps: 'LocalMachine', native: 'HKEY_LOCAL_MACHINE' },
  HKCR: { ps: 'ClassesRoot', native: 'HKEY_CLASSES_ROOT' },
  HKU: { ps: 'Users', native: 'HKEY_USERS' }
};

/** Splits "HKLM\\SOFTWARE\\X" into { hive: 'HKLM', sub: 'SOFTWARE\\X' }. Returns null when invalid. */
export function splitRegKey(key) {
  const m = /^(HKCU|HKLM|HKCR|HKU)(?:\\(.*))?$/i.exec(String(key || '').trim());
  if (!m) return null;
  const sub = (m[2] || '').replace(/\\+$/, '');
  if (/[\r\n\0]/.test(sub) || sub.includes('\\\\')) return null;
  return { hive: m[1].toUpperCase(), sub };
}

export function isUserHiveKey(key) {
  return splitRegKey(key)?.hive === 'HKCU';
}

const KIND_BY_TYPE = {
  REG_DWORD: 'DWord',
  REG_QWORD: 'QWord',
  REG_SZ: 'String',
  REG_EXPAND_SZ: 'ExpandString',
  REG_BINARY: 'Binary',
  REG_MULTI_SZ: 'MultiString'
};
const TYPE_BY_KIND = Object.fromEntries(Object.entries(KIND_BY_TYPE).map(([t, k]) => [k.toLowerCase(), t]));

export function typeToKind(type) {
  return KIND_BY_TYPE[String(type || 'REG_SZ').toUpperCase()] || null;
}
export function kindToType(kind) {
  return TYPE_BY_KIND[String(kind || '').toLowerCase()] || null;
}

/** DWORD helper: accepts '0x1', '1', 1, -1 ('0xffffffff') and returns the unsigned number. */
export function parseDwordLike(data) {
  if (typeof data === 'number') return data >>> 0;
  const s = String(data ?? '').trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return Number.parseInt(s, 16) >>> 0;
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10) >>> 0;
  return Number.NaN;
}

export function parseBinaryLike(data) {
  if (Array.isArray(data)) return data.map((n) => Number(n) & 0xff);
  const s = String(data ?? '').replace(/[^0-9a-f]/gi, '');
  const out = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push(Number.parseInt(s.slice(i, i + 2), 16));
  return out;
}

/** Canonical string used to compare registry values regardless of how they were read. */
export function canonicalRegValue(type, data) {
  const t = String(type || 'REG_SZ').toUpperCase();
  if (t === 'REG_DWORD') {
    const n = parseDwordLike(data);
    return Number.isNaN(n) ? `nan:${String(data)}` : String(n);
  }
  if (t === 'REG_QWORD') {
    try {
      const s = String(data ?? '').trim();
      return BigInt(/^0x/i.test(s) ? s : s || '0').toString();
    } catch {
      return `nan:${String(data)}`;
    }
  }
  if (t === 'REG_BINARY') return parseBinaryLike(data).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (t === 'REG_MULTI_SZ') return Array.isArray(data) ? data.join('|') : String(data ?? '');
  return String(data ?? '');
}

/**
 * Does the value read from the system (current = { exists, kind|type, value|data }) match the desired change?
 */
export function regValueMatches(change, current) {
  if (!current || !current.exists) return false;
  const type = String(change.type || 'REG_SZ').toUpperCase();
  const curType = current.type || kindToType(current.kind) || type;
  // REG_SZ vs REG_EXPAND_SZ are interchangeable for our purposes; DWORD vs string must not match.
  const sameFamily = (a, b) => a === b || (['REG_SZ', 'REG_EXPAND_SZ'].includes(a) && ['REG_SZ', 'REG_EXPAND_SZ'].includes(b));
  if (!sameFamily(type, String(curType).toUpperCase())) return false;
  const raw = current.value !== undefined ? current.value : current.data;
  return canonicalRegValue(type, raw) === canonicalRegValue(type, change.data);
}

const NAME_OK = /^[^\r\n\0]{0,260}$/;
const KEY_OK = /^[^\r\n\0]{1,1000}$/;
/** Static validation of a registry change definition (defence in depth for persisted snapshots). */
export function validateChange(change) {
  if (!change || typeof change !== 'object') return false;
  if (!KEY_OK.test(String(change.key || '')) || !splitRegKey(change.key)) return false;
  if (change.name !== undefined && !NAME_OK.test(String(change.name))) return false;
  if (change.deleteKey || change.deleteKeyIfEmpty) return true;
  if (change.deleteValue) return true;
  return typeToKind(change.type || 'REG_SZ') !== null;
}

/** PowerShell expression for the value to be written (all literals are quoted/escaped). */
export function psValueLiteral(type, data) {
  const t = String(type || 'REG_SZ').toUpperCase();
  if (t === 'REG_DWORD') {
    const u = parseDwordLike(data);
    const n = Number.isNaN(u) ? 0 : u;
    return `[BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]${n}),0)`;
  }
  if (t === 'REG_QWORD') {
    let b = 0n;
    try { b = BigInt(String(data ?? '0').trim() || '0'); } catch { b = 0n; }
    return `[int64]${b.toString()}`;
  }
  if (t === 'REG_BINARY') return `[byte[]]@(${parseBinaryLike(data).join(',')})`;
  if (t === 'REG_MULTI_SZ') {
    const arr = Array.isArray(data) ? data : String(data ?? '').split('|').filter(Boolean);
    return `[string[]]@(${arr.map(psQuote).join(',')})`;
  }
  return psQuote(data ?? '');
}

/**
 * Builds a PowerShell script (ASCII only) that applies registry operations through the .NET registry API
 * (64-bit view, no reg.exe, no quoting problems) and prints one `DHRES|<index>|ok` / `DHRES|<index>|fail|<msg>` line per op.
 * op: { key, name?, type?, data?, deleteKey?, deleteValue? }
 */
export function buildRegistryScript(ops) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    'function DH-Open([string]$hive, [bool]$create, [string]$sub, [bool]$writable) {',
    "  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]$hive, [Microsoft.Win32.RegistryView]::Registry64)",
    '  if ($create) { return $base.CreateSubKey($sub) }',
    '  return $base.OpenSubKey($sub, $writable)',
    '}'
  ];
  ops.forEach((op, i) => {
    const parts = splitRegKey(op.key);
    if (!parts) {
      lines.push(`Write-Output 'DHRES|${i}|fail|invalid key'`);
      return;
    }
    if (!parts.sub) {
      lines.push(`Write-Output 'DHRES|${i}|fail|refusing to modify a registry hive root'`);
      return;
    }
    const hive = HIVES[parts.hive].ps;
    const sub = psQuote(parts.sub);
    const name = psQuote(op.name || '');
    let body;
    if (op.deleteKeyIfEmpty) {
      body = `$k = DH-Open '${hive}' $false ${sub} $false; if ($k) { $empty = ($k.ValueCount -eq 0 -and $k.SubKeyCount -eq 0); $k.Close(); if ($empty) { $b = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]'${hive}', [Microsoft.Win32.RegistryView]::Registry64); try { $b.DeleteSubKey(${sub}, $false) } finally { $b.Close() } } }`;
    } else if (op.deleteKey) {
      body = `$b = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]'${hive}', [Microsoft.Win32.RegistryView]::Registry64); try { $b.DeleteSubKeyTree(${sub}, $false) } finally { $b.Close() }`;
    } else if (op.deleteValue) {
      body = `$k = DH-Open '${hive}' $false ${sub} $true; if ($k) { try { $k.DeleteValue(${name}, $false) } finally { $k.Close() } }`;
    } else {
      const kind = typeToKind(op.type || 'REG_SZ');
      if (!kind) {
        lines.push(`Write-Output 'DHRES|${i}|fail|invalid type'`);
        return;
      }
      body = `$k = DH-Open '${hive}' $true ${sub} $true; try { $k.SetValue(${name}, ${psValueLiteral(op.type || 'REG_SZ', op.data)}, [Microsoft.Win32.RegistryValueKind]'${kind}') } finally { $k.Close() }`;
    }
    lines.push(`try { ${body}; Write-Output 'DHRES|${i}|ok' } catch { Write-Output ('DHRES|${i}|fail|' + (($_.Exception.Message -replace '[\\r\\n|]+',' '))) }`);
  });
  return lines.join('\r\n');
}

/** Builds the read-only batch script that reports the current value/kind of each entry as JSON. */
export function buildRegistryReadScript(entries) {
  const payload = JSON.stringify(entries.map((e) => ({ key: e.key, name: e.name || '' })));
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$items = ConvertFrom-Json ${psQuote(payload)}`,
    '$out = @()',
    'foreach ($it in $items) {',
    "  $r = [ordered]@{ key = $it.key; name = $it.name; keyExists = $false; exists = $false; kind = $null; value = $null }",
    "  if ($it.key -match '^(HKCU|HKLM|HKCR|HKU)(\\\\(.*))?$') {",
    "    $hive = switch ($Matches[1].ToUpper()) { 'HKCU' { 'CurrentUser' } 'HKLM' { 'LocalMachine' } 'HKCR' { 'ClassesRoot' } default { 'Users' } }",
    '    $sub = $Matches[3]',
    '    try {',
    "      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]$hive, [Microsoft.Win32.RegistryView]::Registry64)",
    '      $k = if ($sub) { $base.OpenSubKey($sub, $false) } else { $base }',
    '      if ($k) {',
    '        $r.keyExists = $true',
    '        $names = $k.GetValueNames()',
    '        if ($names -contains $it.name) {',
    '          $r.exists = $true',
    '          $r.kind = [string]$k.GetValueKind($it.name)',
    "          $v = $k.GetValue($it.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
    "          if ($v -is [byte[]]) { $v = (($v | ForEach-Object { $_.ToString('x2') }) -join '') }",
    "          elseif ($v -is [string[]]) { $v = ($v -join '|') }",
    '          $r.value = $v',
    '        }',
    '        $k.Close()',
    '      }',
    '    } catch {}',
    '  }',
    '  $out += [pscustomobject]$r',
    '}',
    'ConvertTo-Json -InputObject @($out) -Compress'
  ].join('\r\n');
}

/** Parses the `DHRES|i|ok` marker lines. Returns Map<index, {ok, message}>. */
export function parseDhResults(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const m = /^DHRES\|(\d+)\|(ok|fail)(?:\|(.*))?$/.exec(raw.trim());
    if (m) map.set(Number(m[1]), { ok: m[2] === 'ok', message: m[3] || '' });
  }
  return map;
}

/** Parses JSON emitted by the read script into Map<"KEY||name", entry>. */
export function parseRegistryReadOutput(stdout) {
  const text = String(stdout || '').trim();
  const map = new Map();
  if (!text) return map;
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    const s = text.indexOf('[');
    const e = text.lastIndexOf(']');
    if (s < 0 || e <= s) return map;
    try { arr = JSON.parse(text.slice(s, e + 1)); } catch { return map; }
  }
  if (!Array.isArray(arr)) arr = [arr];
  for (const it of arr) {
    if (!it || typeof it.key !== 'string') continue;
    map.set(regEntryId(it.key, it.name), {
      key: it.key,
      name: it.name || '',
      keyExists: !!it.keyExists,
      exists: !!it.exists,
      kind: it.kind || null,
      type: it.kind ? kindToType(it.kind) : null,
      value: it.value === undefined ? null : it.value
    });
  }
  return map;
}

export function regEntryId(key, name) {
  return `${String(key).toLowerCase()}||${String(name || '').toLowerCase()}`;
}

/**
 * Turns a snapshot entry (what existed before the tweak) into the operation that restores it.
 * Legacy snapshots stored REG_DWORD data as "0x1" strings - handled by parseDwordLike.
 */
export function snapshotEntryToOps(entry) {
  if (!entry || !validateChange({ key: entry.key, name: entry.name, type: entry.type || 'REG_SZ', deleteValue: !entry.existed })) return [];
  if (!entry.existed) {
    // Remove the value; if the key did not exist before, also remove it when it ends up empty.
    const ops = [{ key: entry.key, name: entry.name || '', deleteValue: true }];
    if (entry.keyExisted === false) ops.push({ key: entry.key, deleteKeyIfEmpty: true });
    return ops;
  }
  const type = String(entry.type || kindToType(entry.kind) || 'REG_SZ').toUpperCase();
  return [{ key: entry.key, name: entry.name || '', type, data: entry.data }];
}

/** Fallback (no snapshot): policy keys are removed, other values get the documented default. */
export function fallbackRevertOp(change) {
  if (!change) return null;
  if (change.deleteKey) return { key: change.key, deleteKey: true };
  if (change.deleteValue || /\\Policies\\/i.test(change.key)) return { key: change.key, name: change.name || '', deleteValue: true };
  return { key: change.key, name: change.name || '', type: change.type, data: change.data };
}

// ---------------------------------------------------------------- tweak classification

/** Tweaks that can break something, lower security or need a reboot never count as "recommended". */
export function isRiskyTweak(tweak) {
  if (!tweak) return false;
  return tweak.risk === 'medium' || tweak.risk === 'high' || tweak.securityRelated === true || tweak.requiresReboot === true;
}

/** The one and only definition of the "recommended / global" selection. */
export function pickRecommendedTweaks(tweaks) {
  return (tweaks || []).filter((t) => t && t.recommended === true && t.risk === 'low' && !isRiskyTweak(t) && !t.internal);
}

// ---------------------------------------------------------------- misc parsers

export function parsePowercfgList(stdout) {
  const plans = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s+\((.*?)\)\s*(\*)?/i.exec(line);
    if (m) plans.push({ guid: m[1].toLowerCase(), name: m[2].trim(), isActive: Boolean(m[3]) || /\*\s*$/.test(line) });
  }
  return plans;
}

export const POWER_GUIDS = {
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61'
};

/** Splits a program's UninstallString into executable + argument string (never goes through a shell). */
export function parseUninstallString(raw) {
  const str = String(raw || '').trim();
  if (!str) return null;
  let file;
  let args = '';
  if (str.startsWith('"')) {
    const end = str.indexOf('"', 1);
    if (end < 0) return null;
    file = str.slice(1, end);
    args = str.slice(end + 1).trim();
  } else {
    const m = /^(.*?\.(?:exe|com|bat|cmd|msi))(?:\s+(.*))?$/i.exec(str);
    if (!m) return null;
    file = m[1];
    args = (m[2] || '').trim();
  }
  if (!file || /[\r\n\0<>|]/.test(file)) return null;
  const base = file.split(/[\\/]/).pop().toLowerCase();
  if (/\.(bat|cmd)$/i.test(base)) return { file: 'cmd.exe', args: `/d /c ""${file}" ${args}"`.trim(), viaCmd: true };
  if (/\.msi$/i.test(base)) return { file: 'msiexec.exe', args: `/x "${file}" ${args}`.trim() };
  return { file, args };
}

/** Merge GpuPreference into the semicolon separated value without dropping other fields (SwapEffectUpgradeEnable...). */
export function mergeGpuPreference(existing, preferenceValue) {
  const fields = String(existing || '').split(';').map((s) => s.trim()).filter(Boolean).filter((s) => !/^GpuPreference=/i.test(s));
  fields.unshift(`GpuPreference=${preferenceValue}`);
  return `${fields.join(';')};`;
}
export function parseGpuPreference(value) {
  const m = /GpuPreference=(\d)/i.exec(String(value || ''));
  if (!m) return 'default';
  return m[1] === '2' ? 'high_performance' : m[1] === '1' ? 'power_saving' : 'default';
}

const CRITICAL_PROCESSES = new Set([
  'system', 'system idle process', 'idle', 'registry', 'memory compression', 'secure system', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe', 'lsaiso.exe', 'dwm.exe', 'fontdrvhost.exe', 'svchost.exe',
  'audiodg.exe', 'msmpeng.exe', 'securityhealthservice.exe', 'sihost.exe', 'ctfmon.exe', 'taskhostw.exe', 'explorer.exe'
]);
export function isCriticalProcessName(name) {
  const n = String(name || '').toLowerCase();
  return CRITICAL_PROCESSES.has(n) || CRITICAL_PROCESSES.has(`${n}.exe`);
}

const PROTECTED_SERVICES = new Set([
  'rpcss', 'dcomlaunch', 'rpceptmapper', 'lsm', 'samss', 'eventlog', 'winmgmt', 'plugplay', 'power', 'profsvc', 'schedule',
  'themes', 'wuauserv', 'windefend', 'mpssvc', 'bfe', 'cryptsvc', 'trustedinstaller', 'bits', 'audiosrv', 'audioendpointbuilder',
  'dhcp', 'dnscache', 'nlasvc', 'netman', 'lanmanworkstation', 'lanmanserver', 'sens', 'shellhwdetection', 'tabletinputservice',
  'usermanager', 'gpsvc', 'sysmain', 'wscsvc', 'securityhealthservice', 'sppsvc', 'timebrokersvc', 'coremessagingregistrar',
  'brokerinfrastructure', 'systemeventsbroker', 'staterepository', 'camsvc', 'keyiso', 'vaultsvc', 'wlansvc', 'wcmsvc', 'nsi'
]);
export function isProtectedService(name) {
  return PROTECTED_SERVICES.has(String(name || '').toLowerCase());
}
export function isValidServiceName(name) {
  return /^[A-Za-z0-9_.$-]{1,256}$/.test(String(name || ''));
}

export function isValidIpv4(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return false;
  return v.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255);
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** Identifier of an Appx package we are willing to touch (exact name, no wildcards). */
export function isValidAppxName(id) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{1,120}$/.test(String(id || '').trim());
}

export const PROTECTED_APPX = [
  'Microsoft.WindowsStore', 'Microsoft.StorePurchaseApp', 'Microsoft.DesktopAppInstaller', 'Microsoft.SecHealthUI',
  'Microsoft.Windows.ShellExperienceHost', 'Microsoft.Windows.StartMenuExperienceHost', 'MicrosoftWindows.Client.CBS',
  'Microsoft.WindowsTerminal', 'Microsoft.UI.Xaml', 'Microsoft.VCLibs', 'Microsoft.NET.Native', 'Microsoft.Windows.Search',
  'Microsoft.XboxIdentityProvider', 'Microsoft.GamingServices', 'Microsoft.XboxGamingOverlay', 'Microsoft.GamingApp',
  'Microsoft.WindowsCalculator', 'Microsoft.Windows.Photos', 'Microsoft.AAD.BrokerPlugin', 'Microsoft.AccountsControl',
  'Microsoft.LockApp', 'Microsoft.WebpImageExtension', 'Microsoft.HEIFImageExtension', 'Microsoft.Windows.CloudExperienceHost'
];
export function isProtectedAppx(id) {
  const n = String(id || '').toLowerCase();
  return PROTECTED_APPX.some((p) => n === p.toLowerCase() || n.startsWith(`${p.toLowerCase()}.`));
}

/** Median that ignores non-finite samples (timeouts). */
export function medianFinite(values) {
  const nums = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return Number.POSITIVE_INFINITY;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** StartupApproved binary values: odd first byte = disabled (03/07), even = enabled (02/06). */
export function isStartupApprovedDisabled(hexOrBytes) {
  const b = parseBinaryLike(hexOrBytes);
  if (!b.length) return false;
  return (b[0] & 1) === 1;
}
export function buildStartupApprovedBytes(disabled, nowMs = Date.now()) {
  const bytes = [disabled ? 3 : 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  if (disabled) {
    // FILETIME = 100ns ticks since 1601-01-01
    let ft = (BigInt(Math.trunc(nowMs)) + 11644473600000n) * 10000n;
    for (let i = 0; i < 8; i += 1) {
      bytes[4 + i] = Number(ft & 0xffn);
      ft >>= 8n;
    }
  }
  return bytes;
}
/** `DHCMD|<index>|ok` / `DHCMD|<index>|fail|msg` markers emitted by buildCommandBlock. */
export function parseDhCommandResults(stdout) {
  const map = new Map();
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const m = /^DHCMD\|(\d+)\|(ok|fail)(?:\|(.*))?$/.exec(raw.trim());
    if (m) map.set(Number(m[1]), { ok: m[2] === 'ok', message: m[3] || '' });
  }
  return map;
}

/** Wraps a command script so its success/failure is reported through a marker line. */
export function buildCommandBlock(index, script) {
  return [
    `try { $ErrorActionPreference = 'Continue'`,
    String(script),
    `Write-Output 'DHCMD|${Number(index)}|ok' } catch { Write-Output ('DHCMD|${Number(index)}|fail|' + (($_.Exception.Message -replace '[\\r\\n|]+',' '))) } finally { $ErrorActionPreference = 'Stop' }`
  ].join('\r\n');
}

/** Lines `DHSNAP|key|value` printed by elevated snapshot scripts. */
export function parseDhSnapLines(stdout, prefix = 'DHSNAP') {
  const out = {};
  const re = new RegExp(`^${prefix}\\|([^|]+)\\|(.*)$`);
  for (const raw of String(stdout || '').split(/\r?\n/)) {
    const m = re.exec(raw.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** bcdedit prints Yes/No (possibly localized); returns the argument to feed back to `bcdedit /set`, or null (= delete the value). */
export function bcdValueToArg(raw) {
  const v = String(raw ?? '').trim();
  if (/^(yes|sim|true|on)$/i.test(v)) return 'yes';
  if (/^(no|n[aã]o|false|off)$/i.test(v)) return 'no';
  return null;
}

/** Pagefile sizes in MB. Returns { ok, init, max, error }. */
export function validatePagefileSizes(initialMb, maxMb) {
  const init = Number(initialMb);
  const max = Number(maxMb);
  if (!Number.isInteger(init) || !Number.isInteger(max)) return { ok: false, error: 'Tamanhos do arquivo de paginação devem ser números inteiros (MB).' };
  if (init < 64 || max < init || max > 1048576) return { ok: false, error: 'Tamanho inválido: use 64 MB <= inicial <= máximo <= 1048576 MB.' };
  return { ok: true, init, max };
}

/** Optional feature names (DISM) are plain identifiers. Anything else is refused (they go into a PowerShell script). */
export function isValidFeatureName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/.test(String(name || ''));
}

/** Windows capability full names, e.g. Hello.Face.18967~~~~0.0.1.0 */
export function isValidCapabilityName(name) {
  return /^[A-Za-z0-9._~-]{3,160}$/.test(String(name || ''));
}

const EXEC_POLICIES = ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass', 'Undefined'];
export function isValidExecutionPolicy(p) {
  return EXEC_POLICIES.includes(p);
}

/** Display PnP instance ids that are safe to put in a registry path (PCI devices only). */
export function isValidPciInstanceId(id) {
  return /^PCI\\[A-Za-z0-9&_.-]+\\[A-Za-z0-9&_.-]+$/.test(String(id || ''));
}

/**
 * Wraps a script that runs elevated so success is decided by an explicit marker, not by the exit code
 * (the elevation wrapper reports the exit code of the last native command, which is unreliable).
 * Scripts must be ASCII only and may call DhCheck 'label' right after a native command.
 */
export function wrapMarkedScript(script) {
  return `$ErrorActionPreference = 'Stop'
function DhCheck([string]$what) { if ($LASTEXITCODE -ne 0) { throw ($what + ' falhou (codigo ' + $LASTEXITCODE + ')') } }
try {
${script}
Write-Output 'DHDONE'
} catch {
Write-Output ('DHFAIL|' + (([string]$_.Exception.Message) -replace '[\\r\\n|]+', ' '))
}`;
}

/** Reads the verdict of a wrapMarkedScript() run. */
export function parseMarkedOutput(res) {
  const out = String(res?.stdout || '');
  const fail = /^DHFAIL\|(.*)$/m.exec(out);
  const done = /^DHDONE\s*$/m.test(out);
  const ok = done && !fail;
  const error = ok ? '' : (fail ? fail[1].trim() : (String(res?.stderr || '').trim() || 'Elevação cancelada (UAC) ou o script não terminou a tempo.'));
  return { ok, out, error };
}

const APPROVED_BASE = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';
/**
 * Where Windows (Task Manager / Settings > Startup apps) stores the enabled/disabled flag of a startup item.
 * item: { type: 'Registry'|'Folder', path, name, scope?: 'user'|'machine' }.
 * Returns { hive, key, valueName } or null (RunOnce is not managed by StartupApproved).
 */
export function startupApprovedTarget(item) {
  const type = item?.type;
  const p = String(item?.path || '');
  if (type === 'Folder') {
    const valueName = p.split(/[\\/]/).pop();
    if (!valueName) return null;
    const machine = item?.scope === 'machine' || /\\programdata\\/i.test(p);
    const hive = machine ? 'HKLM' : 'HKCU';
    return { hive, key: `${hive}\\${APPROVED_BASE}\\StartupFolder`, valueName };
  }
  if (type === 'Registry') {
    const m = /^(HKCU|HKLM):\\?(.*)$/i.exec(p);
    if (!m) return null;
    const hive = m[1].toUpperCase();
    const lower = m[2].toLowerCase();
    let sub = null;
    if (lower.includes('wow6432node') && lower.endsWith('\\run')) sub = 'Run32';
    else if (lower.endsWith('\\run')) sub = 'Run';
    if (!sub || !item?.name) return null;
    return { hive, key: `${hive}\\${APPROVED_BASE}\\${sub}`, valueName: String(item.name) };
  }
  return null;
}

/** 'HKCU:\\Software\\X' -> 'HKCU\\Software\\X' */
export function psPathToRegKey(p) {
  return String(p || '').replace(/^(HKCU|HKLM):\\?/i, '$1\\');
}

export function bytesToHex(bytes) {
  return (bytes || []).map((b) => Number(b).toString(16).padStart(2, '0')).join('');
}

const PRIORITY_NAMES = { idle: 'Idle', belownormal: 'BelowNormal', normal: 'Normal', abovenormal: 'AboveNormal', high: 'High', realtime: 'RealTime' };
/** Accepts the UI ids (low/belowNormal/...) and returns the .NET ProcessPriorityClass name, or null. */
export function normalizePriorityName(value) {
  const k = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'low') return 'Idle';
  return PRIORITY_NAMES[k] || null;
}

const GENERIC_FOLDERS = new Set(['programs', 'packages', 'microsoft', 'temp', 'cache', 'local', 'roaming', 'common files', 'windowsapps', 'windows', 'apps']);
/**
 * Install folder we are willing to delete after an uninstall: strictly below a well-known root, never a generic
 * container (e.g. %LOCALAPPDATA%\Programs itself), never a drive root. roots: absolute root paths (lowercase compare).
 */
export function isSafeInstallLocationFor(location, roots, sep = '\\') {
  if (!location) return false;
  const norm = (s) => String(s).replace(/^"|"$/g, '').replace(/[\\/]+/g, sep).replace(new RegExp(`${sep.replace('\\', '\\\\')}+$`), '');
  const loc = norm(location).toLowerCase();
  if (/[\r\n\0*?<>|]/.test(loc)) return false;
  for (const rootRaw of roots || []) {
    if (!rootRaw) continue;
    const root = norm(rootRaw).toLowerCase();
    if (!loc.startsWith(root + sep)) continue;
    const segs = loc.slice(root.length + 1).split(sep).filter(Boolean);
    if (segs.length === 0 || segs.includes('..')) return false;
    if (segs[0].length < 3) return false;
    if (GENERIC_FOLDERS.has(segs[0]) && segs.length < 2) return false;
    return true;
  }
  return false;
}
