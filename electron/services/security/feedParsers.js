// Pure helpers for Advanced Security: feed parsers, the managed hosts block and Windows Firewall scripts.
// No Electron / no OS access here, so everything is unit-testable (tests/securityAdvanced.test.ts).
import { psQuote } from '../optimizer/OptimizerUtils.js';

export const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SINKHOLE_IPS = new Set(['0.0.0.0', '127.0.0.1', '::', '::1', '::0']);
const SPECIAL_NAMES = new Set(['localhost', 'localhost.localdomain', 'local', 'broadcasthost', 'ip6-localhost', 'ip6-loopback', 'ip6-localnet', 'ip6-mcastprefix', 'ip6-allnodes', 'ip6-allrouters', 'ip6-allhosts', '0.0.0.0']);

/**
 * Domains that are never written to the hosts file, whatever a list says:
 * - Microsoft / Windows Update: Defender flags hosts files that redirect them (SettingsModifier:Win32/HostsFileHijack)
 *   and blocking them breaks updates and activation;
 * - the feed servers themselves, so the lists can always be updated.
 */
export const NEVER_BLOCK_SUFFIXES = Object.freeze([
  'microsoft.com', 'windows.com', 'windowsupdate.com', 'microsoftonline.com', 'live.com', 'msftconnecttest.com',
  'msftncsi.com', 'office.com', 'office.net', 'windows.net',
  'github.com', 'githubusercontent.com', 'github.io', 'gitlab.com', 'gitlab.io', 'spamhaus.org', 'abuse.ch'
]);

export function isNeverBlocked(domain) {
  const d = String(domain || '').toLowerCase();
  return NEVER_BLOCK_SUFFIXES.some((s) => d === s || d.endsWith(`.${s}`));
}

/** Lower-cases, strips a trailing dot / leading "*." and validates. Returns null for anything that is not a plain hostname. */
export function normalizeDomain(raw) {
  let d = String(raw || '').trim().toLowerCase();
  if (d.startsWith('*.')) d = d.slice(2);
  if (d.endsWith('.')) d = d.slice(0, -1);
  if (!d || SPECIAL_NAMES.has(d) || !HOSTNAME_RE.test(d)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(d)) return null;
  return d;
}

function eachDataLine(text, fn) {
  const s = String(text || '');
  let start = 0;
  while (start <= s.length) {
    let end = s.indexOf('\n', start);
    if (end === -1) end = s.length;
    const line = s.slice(start, end).replace(/\r$/, '');
    start = end + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith(';')) continue;
    if (fn(trimmed) === false) break;
  }
}

/**
 * "0.0.0.0 domain [domain...]" lines. Lines that point a name at any other address are dropped:
 * a list must never be able to redirect a site to a server of its choice.
 */
export function parseHostsFormat(text, { maxEntries = 1_000_000 } = {}) {
  const out = new Set();
  eachDataLine(text, (line) => {
    const tokens = line.replace(/#.*$/, '').trim().split(/\s+/);
    if (tokens.length < 2 || !SINKHOLE_IPS.has(tokens[0])) return true;
    for (const tok of tokens.slice(1)) {
      const d = normalizeDomain(tok);
      if (d) out.add(d);
    }
    return out.size < maxEntries;
  });
  return [...out];
}

/** One domain per line (HaGeZi "onlydomains" format). */
export function parseDomainList(text, { maxEntries = 1_000_000 } = {}) {
  const out = new Set();
  eachDataLine(text, (line) => {
    const tok = line.replace(/#.*$/, '').trim().split(/\s+/)[0];
    if (!tok || tok.includes('/') || tok.includes(':')) return true;
    const d = normalizeDomain(tok);
    if (d) out.add(d);
    return out.size < maxEntries;
  });
  return [...out];
}

// ------------------------------------------------------------------ IPv4

export function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255) || m.slice(1).some((p) => p.length > 1 && p.startsWith('0'))) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function intToIpv4(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** "a.b.c.d" or "a.b.c.d/nn" -> { start, end, text } (network-aligned). Prefixes shorter than /8 are refused. */
export function parseCidr(raw, minPrefix = 8) {
  const [ipPart, prefixPart, extra] = String(raw || '').trim().split('/');
  if (extra !== undefined) return null;
  const ip = ipv4ToInt(ipPart);
  if (ip === null) return null;
  let prefix = 32;
  if (prefixPart !== undefined) {
    if (!/^\d{1,2}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
  }
  if (prefix < minPrefix || prefix > 32) return null;
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ip / size) * size;
  const end = start + size - 1;
  return { start, end, text: prefix === 32 ? intToIpv4(start) : `${intToIpv4(start)}/${prefix}` };
}

/** Private, loopback, link-local, CGNAT, multicast and reserved space: never blocked (would cut the LAN). */
export const RESERVED_RANGES = Object.freeze([
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4'
].map((c) => parseCidr(c, 0)));

export function overlapsReserved(range) {
  return RESERVED_RANGES.some((r) => range.start <= r.end && r.start <= range.end);
}

/** IPv4 / CIDR list (Spamhaus "cidr ; SBL" lines, plain IP lists, IPsum "ip<TAB>count"). */
export function parseIpList(text, { maxEntries = 200_000 } = {}) {
  const out = new Map();
  eachDataLine(text, (line) => {
    const tok = line.replace(/[;#].*$/, '').trim().split(/\s+/)[0];
    const r = parseCidr(tok);
    if (r && !overlapsReserved(r)) out.set(r.text, r);
    return out.size < maxEntries;
  });
  return [...out.keys()];
}

/** Sorted, merged ranges with a binary search, to tag live connections whose remote IP is on a blocklist. */
export function buildIpMatcher(entries) {
  const ranges = [];
  for (const e of entries || []) {
    const r = typeof e === 'string' ? parseCidr(e) : e;
    if (r) ranges.push([r.start, r.end, r.source || null]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  return {
    size: ranges.length,
    match(ip) {
      const n = ipv4ToInt(String(ip || '').replace(/^::ffff:/i, ''));
      if (n === null) return null;
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [s, e, src] = ranges[mid];
        if (n < s) hi = mid - 1;
        else if (n > e) lo = mid + 1;
        else return src || true;
      }
      // overlapping ranges: fall back to a short linear scan of the neighbourhood
      for (let i = Math.max(0, hi - 64); i < Math.min(ranges.length, lo + 1); i++) {
        if (n >= ranges[i][0] && n <= ranges[i][1]) return ranges[i][2] || true;
      }
      return null;
    }
  };
}

// ------------------------------------------------------------------ hashes

/** "sha256", "sha256;comment" or "sha256,comment" lines; MD5/SHA-1 lines are ignored. */
export function parseSha256List(text, { maxEntries = 500_000 } = {}) {
  const out = new Map();
  eachDataLine(text, (line) => {
    const [first, ...rest] = line.split(/[;,\t ]/);
    const sha256 = String(first || '').trim().toLowerCase();
    if (!SHA256_RE.test(sha256) || out.has(sha256)) return true;
    const name = rest.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    out.set(sha256, { sha256, name });
    return out.size < maxEntries;
  });
  return [...out.values()];
}

/** The "last modified" date a list advertises in its header comments (free text, display only). */
export function extractUpstreamDate(text) {
  const head = String(text || '').slice(0, 4096);
  const m = /^[#;!]\s*(?:Last[- ]modified|Last updated|Updated|Date|Source File Date)\s*:\s*(.+?)\s*#?\s*$/im.exec(head);
  return m ? m[1].trim().slice(0, 80) : null;
}

/** Dispatches on source.format. Returns { entries, count, upstreamDate }. */
export function parseFeed(source, text) {
  let entries;
  switch (source?.format) {
    case 'hosts': entries = parseHostsFormat(text).filter((d) => !isNeverBlocked(d)); break;
    case 'domains': entries = parseDomainList(text).filter((d) => !isNeverBlocked(d)); break;
    case 'ips': entries = parseIpList(text); break;
    case 'sha256': entries = parseSha256List(text); break;
    default: throw new Error(`unknown feed format: ${source?.format}`);
  }
  return { entries, count: entries.length, upstreamDate: extractUpstreamDate(text) };
}

/** Rejects error pages served with HTTP 200 (HTML, JSON errors) before they are parsed. */
export function looksLikeHtml(text) {
  return /^\s*(<!doctype html|<html|<\?xml|<head|<body)/i.test(String(text || '').slice(0, 512));
}

// ------------------------------------------------------------------ managed hosts block

export const HOSTS_BEGIN = '# >>> DarkHub Suite community blocklists BEGIN';
export const HOSTS_END = '# <<< DarkHub Suite community blocklists END >>>';
/**
 * Hard cap on lines in the managed block. The Windows DNS Client re-parses hosts on every change (and at boot) and that
 * cost grows faster than the list: measured in the test VM, the first lookup after the change took 4 s at 5k entries,
 * 10 s at 10k, 38 s at 20k, 2 min at 40k and 12 min at ~100k, with no name resolution meanwhile. Larger blocking
 * belongs to a filtering DNS (Quad9, Cloudflare Security, AdGuard), not to hosts.
 */
export const HOSTS_MAX_ENTRIES = 10_000;
export const HOSTS_WARN_ENTRIES = 5_000;

function detectEol(content) {
  if (content.includes('\r\n')) return '\r\n';
  if (content.includes('\n')) return '\n';
  return '\r\n';
}

/** Names already present in active (non-comment) user lines, so we never fight a mapping the user made. */
export function userMappedNames(content) {
  const names = new Set();
  eachDataLine(content, (line) => {
    const tokens = line.replace(/#.*$/, '').trim().split(/\s+/);
    for (const t of tokens.slice(1)) names.add(t.toLowerCase());
    return true;
  });
  return names;
}

/**
 * Removes every managed block, restoring the bytes the user had around it (including whether the file ended
 * with a newline before we appended). Returns { ok, content, removed } or { ok:false, error } when a block
 * has no END marker (we then refuse to touch the file).
 */
export function removeManagedBlock(content) {
  let text = String(content ?? '');
  let removed = 0;
  for (;;) {
    let idx = text.indexOf(HOSTS_BEGIN);
    while (idx > 0 && text[idx - 1] !== '\n') idx = text.indexOf(HOSTS_BEGIN, idx + 1);
    if (idx === -1) break;
    const endIdx = text.indexOf(HOSTS_END, idx);
    if (endIdx === -1) return { ok: false, error: 'unterminated-block', content: String(content ?? '') };
    const beginLineEnd = text.indexOf('\n', idx);
    const beginLine = text.slice(idx, beginLineEnd === -1 ? text.length : beginLineEnd);
    let cutEnd = endIdx + HOSTS_END.length;
    if (text.startsWith('\r\n', cutEnd)) cutEnd += 2;
    else if (text.startsWith('\n', cutEnd)) cutEnd += 1;
    let cutStart = idx;
    if (/\|\s*nl=1\b/.test(beginLine)) {
      if (text.slice(0, cutStart).endsWith('\r\n')) cutStart -= 2;
      else if (text.slice(0, cutStart).endsWith('\n')) cutStart -= 1;
    }
    text = text.slice(0, cutStart) + text.slice(cutEnd);
    removed += 1;
  }
  return { ok: true, content: text, removed };
}

/**
 * Replaces our managed block with a fresh one holding `domains`. Everything outside the block is kept byte for byte.
 * meta: { sources: string[], updatedAt: ISO string }.
 */
export function mergeManagedBlock(content, domains, meta = {}) {
  const stripped = removeManagedBlock(content);
  if (!stripped.ok) return stripped;
  const base = stripped.content;
  const eol = detectEol(base);
  const userNames = userMappedNames(base);
  const unique = [];
  const seen = new Set();
  let skippedUser = 0;
  for (const raw of domains || []) {
    const d = normalizeDomain(raw);
    if (!d || seen.has(d) || isNeverBlocked(d)) continue;
    seen.add(d);
    if (userNames.has(d)) { skippedUser += 1; continue; }
    unique.push(d);
  }
  // refuse instead of silently cutting the lists: the user picks smaller lists or a filtering DNS
  if (unique.length > HOSTS_MAX_ENTRIES) return { ok: false, error: 'too-many', count: unique.length, max: HOSTS_MAX_ENTRIES };
  const needsNl = base.length > 0 && !base.endsWith('\n');
  const sources = (meta.sources || []).map((s) => String(s).replace(/[^a-z0-9._-]/gi, '')).filter(Boolean).join(',');
  const header = `${HOSTS_BEGIN} | nl=${needsNl ? 1 : 0} | entries=${unique.length} | updated=${String(meta.updatedAt || '').replace(/[^0-9TZ:.-]/g, '')} | sources=${sources}`;
  const lines = [header, '# Managed by DarkHub Suite (Advanced Security). Remove it from the app; edits here are overwritten.'];
  for (const d of unique) lines.push(`0.0.0.0 ${d}`);
  lines.push(HOSTS_END);
  const out = base + (needsNl ? eol : '') + lines.join(eol) + eol;
  return { ok: true, content: out, count: unique.length, skippedUser, truncated: false };
}

/** What the hosts file currently holds in our block: { present, entries, sources, updatedAt, unterminated }. */
export function readManagedBlockInfo(content) {
  const text = String(content ?? '');
  const idx = text.indexOf(HOSTS_BEGIN);
  if (idx === -1) return { present: false, entries: 0, sources: [], updatedAt: null, unterminated: false };
  const endIdx = text.indexOf(HOSTS_END, idx);
  const block = text.slice(idx, endIdx === -1 ? text.length : endIdx);
  const header = block.split(/\r?\n/, 1)[0];
  let entries = 0;
  for (const line of block.split(/\r?\n/)) if (line.startsWith('0.0.0.0 ')) entries += 1;
  const src = /\|\s*sources=([^|]*)/.exec(header)?.[1]?.trim() || '';
  return {
    present: true,
    entries,
    sources: src ? src.split(',') : [],
    updatedAt: /\|\s*updated=([^|\s]*)/.exec(header)?.[1] || null,
    unterminated: endIdx === -1
  };
}

/** Elevated copy of a staged hosts file; refuses to copy if the staged file changed after we hashed it. */
export function buildHostsWriteScript({ stagedPath, sha256, hostsPath }) {
  if (!/^[0-9a-f]{64}$/.test(String(sha256))) throw new Error('invalid sha256');
  return [
    `$src = ${psQuote(stagedPath)}`,
    `$dst = ${psQuote(hostsPath)}`,
    '$h = (Get-FileHash -LiteralPath $src -Algorithm SHA256).Hash.ToLowerInvariant()',
    `if ($h -ne ${psQuote(sha256)}) { throw 'staged hosts file changed before it was copied' }`,
    // right after a change Windows re-reads hosts (DNS Client, antivirus); with ~100k entries that took over 10 s in the
    // test VM, so wait up to 60 s for the file to be released instead of failing
    '$copied = $false',
    'for ($i = 0; $i -lt 120 -and -not $copied; $i++) { try { Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop; $copied = $true } catch { Start-Sleep -Milliseconds 500 } }',
    "if (-not $copied) { throw 'hosts file is locked by another program' }",
    'Remove-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue',
    'ipconfig /flushdns | Out-Null'
  ].join('\r\n');
}

// ------------------------------------------------------------------ Windows Firewall

export const FIREWALL_GROUP = 'DarkHub Community IP Blocklist';
export const FIREWALL_CHUNK = 1000;
export const FIREWALL_MAX_ADDRESSES = 30_000;

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Re-validates every address (the cache on disk is user-writable) and drops reserved space. */
export function sanitizeFirewallAddresses(list) {
  const out = new Set();
  for (const a of list || []) {
    const r = parseCidr(a);
    if (r && !overlapsReserved(r)) out.add(r.text);
    if (out.size >= FIREWALL_MAX_ADDRESSES) break;
  }
  return [...out];
}

/**
 * One inbound + one outbound Block rule per chunk of addresses, all in FIREWALL_GROUP, so the whole set is
 * removable as a group. Previous rules of the group are replaced. Prints DHSNAP|firewall|<rules before> and DHFW|<rules after>.
 */
export function buildFirewallApplyScript(addresses, chunkSize = FIREWALL_CHUNK) {
  const clean = sanitizeFirewallAddresses(addresses);
  if (clean.length === 0) throw new Error('no addresses');
  const lines = [
    `$g = ${psQuote(FIREWALL_GROUP)}`,
    "$before = @(Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue).Count",
    "Write-Output ('DHSNAP|firewall|' + $before)",
    'Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue | Remove-NetFirewallRule',
    '$chunks = New-Object System.Collections.ArrayList'
  ];
  for (const c of chunk(clean, chunkSize)) lines.push(`[void]$chunks.Add([string[]]@(${c.map((a) => `'${a}'`).join(',')}))`);
  lines.push(
    '$i = 0',
    'foreach ($c in $chunks) {',
    '  $i++',
    "  foreach ($dir in @('Outbound','Inbound')) {",
    "    New-NetFirewallRule -Name ('DarkHub-Blocklist-' + $dir + '-' + $i) -DisplayName ('DarkHub blocklist ' + $dir + ' ' + $i) -Group $g -Direction $dir -Action Block -Profile Any -Enabled True -RemoteAddress $c -Description 'Managed by DarkHub Suite: community IP blocklists' | Out-Null",
    '  }',
    '}',
    "Write-Output ('DHFW|' + @(Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue).Count)"
  );
  return lines.join('\r\n');
}

export function buildFirewallRemoveScript() {
  return [
    `$g = ${psQuote(FIREWALL_GROUP)}`,
    'Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue | Remove-NetFirewallRule',
    "Write-Output ('DHFW|' + @(Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue).Count)"
  ].join('\r\n');
}

export function buildFirewallStatusScript() {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$g = ${psQuote(FIREWALL_GROUP)}`,
    '$r = @(Get-NetFirewallRule -Group $g -ErrorAction SilentlyContinue)',
    "$en = @($r | Where-Object { [string]$_.Enabled -eq 'True' }).Count",
    '[pscustomobject]@{ rules = $r.Count; enabled = $en } | ConvertTo-Json -Compress'
  ].join('\r\n');
}

export function parseFirewallCount(stdout) {
  const m = /^DHFW\|(\d+)\s*$/m.exec(String(stdout || ''));
  return m ? Number(m[1]) : null;
}
