// Network latency lab: measurable diagnostics (live ping, per-hop traceroute, bufferbloat, MTU discovery) and a few
// reversible latency tweaks that the System Optimizer does not already cover (adapter interrupt moderation, flow
// control, adapter power saving, ECN, QoS DSCP per game exe). Every tweak reads the current value first, stores it
// (DeepTweaksEngine extras) and has an exact Restore. Pure helpers are exported for unit tests.
import net from 'node:net';
import https from 'node:https';
import ElevationHelper from './optimizer/ElevationHelper.js';
import DeepTweaksEngine from './optimizer/DeepTweaksEngine.js';
import { runCommand, runPowerShell } from './PowerShellRunner.js';
import { psQuote, parseDhSnapLines } from './optimizer/OptimizerUtils.js';

export const SAFE_HOST_RE = /^[A-Za-z0-9_.:-]{1,253}$/;

export function assertSafeHost(host) {
  const h = String(host ?? '').trim();
  if (!SAFE_HOST_RE.test(h) || h.startsWith('-')) {
    throw new Error('Host inválido: apenas letras, números, pontos, dois-pontos, hífen e underscore são permitidos.');
  }
  return h;
}

/**
 * Regional endpoints that answer ICMP or TCP/443. Game publishers rarely expose a pingable game server, so the
 * presets use the anycast/regional front doors that their traffic actually rides on.
 */
export const LATENCY_PRESETS = [
  { id: 'cf', label: 'Cloudflare (1.1.1.1)', host: '1.1.1.1', mode: 'icmp', group: 'dns' },
  { id: 'google', label: 'Google DNS (8.8.8.8)', host: '8.8.8.8', mode: 'icmp', group: 'dns' },
  { id: 'quad9', label: 'Quad9 (9.9.9.9)', host: '9.9.9.9', mode: 'icmp', group: 'dns' },
  { id: 'steam', label: 'Steam (api.steampowered.com)', host: 'api.steampowered.com', mode: 'tcp', group: 'game' },
  { id: 'epic', label: 'Epic Games (epicgames.com)', host: 'www.epicgames.com', mode: 'tcp', group: 'game' },
  { id: 'riot', label: 'Riot Games (auth.riotgames.com)', host: 'auth.riotgames.com', mode: 'tcp', group: 'game' },
  { id: 'aws-sa', label: 'AWS São Paulo (sa-east-1)', host: 'dynamodb.sa-east-1.amazonaws.com', mode: 'tcp', group: 'region' },
  { id: 'aws-use', label: 'AWS Virginia (us-east-1)', host: 'dynamodb.us-east-1.amazonaws.com', mode: 'tcp', group: 'region' },
  { id: 'aws-usw', label: 'AWS Oregon (us-west-2)', host: 'dynamodb.us-west-2.amazonaws.com', mode: 'tcp', group: 'region' },
  { id: 'aws-euc', label: 'AWS Frankfurt (eu-central-1)', host: 'dynamodb.eu-central-1.amazonaws.com', mode: 'tcp', group: 'region' },
  { id: 'aws-apne', label: 'AWS Tóquio (ap-northeast-1)', host: 'dynamodb.ap-northeast-1.amazonaws.com', mode: 'tcp', group: 'region' }
];

// ------------------------------------------------------------------ pure parsing / math

/** RTT in ms of one ping.exe reply line (any locale: "time=12ms", "tempo=12ms", "time<1ms"). null when none. */
export function parsePingTime(line) {
  const m = /[=<]\s*(\d+(?:[.,]\d+)?)\s*ms\b/i.exec(String(line || ''));
  if (!m) return null;
  if (/<\s*\d/.test(m[0])) return 0.5; // "<1ms"
  return Number(m[1].replace(',', '.'));
}

/** All RTTs of a ping.exe run, in order (lost replies are not listed; use `sent - samples.length` for loss). */
export function parsePingOutput(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!/TTL=/i.test(line)) continue; // only real echo replies carry TTL
    const t = parsePingTime(line);
    if (t !== null) out.push(t);
  }
  return out;
}

const round1 = (n) => Math.round(n * 10) / 10;

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/**
 * samples: array of numbers (ms) or null (lost). Jitter = mean absolute difference between consecutive replies
 * (RFC 3550 style, without smoothing).
 */
export function computeLatencyStats(samples) {
  const list = Array.isArray(samples) ? samples : [];
  const ok = list.filter((x) => typeof x === 'number' && Number.isFinite(x));
  const lost = list.length - ok.length;
  if (!ok.length) return { count: list.length, received: 0, lossPct: list.length ? 100 : 0, min: null, max: null, avg: null, median: null, p95: null, jitter: null };
  const sorted = [...ok].sort((a, b) => a - b);
  let diff = 0;
  for (let i = 1; i < ok.length; i += 1) diff += Math.abs(ok[i] - ok[i - 1]);
  return {
    count: list.length,
    received: ok.length,
    lossPct: round1((lost / list.length) * 100),
    min: round1(sorted[0]),
    max: round1(sorted[sorted.length - 1]),
    avg: round1(ok.reduce((a, b) => a + b, 0) / ok.length),
    median: round1(percentile(sorted, 50)),
    p95: round1(percentile(sorted, 95)),
    jitter: ok.length > 1 ? round1(diff / (ok.length - 1)) : 0
  };
}

/** tracert -d output -> [{ hop, rtts: [ms|null x3], ip|null, best|null }] */
export function parseTracertOutput(text) {
  const hops = [];
  const re = /^\s*(\d{1,2})\s+((?:(?:<?\s*\d+\s*ms|\*)\s+){3})(.*)$/i;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const rtts = (m[2].match(/<?\s*\d+\s*ms|\*/gi) || []).slice(0, 3).map((tok) => {
      if (tok === '*') return null;
      if (tok.startsWith('<')) return 0.5;
      return Number(/\d+/.exec(tok)[0]);
    });
    const rest = m[3].trim();
    const ipm = /(\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f]*:[0-9a-f:]+)/i.exec(rest);
    const valid = rtts.filter((x) => x !== null);
    hops.push({ hop: Number(m[1]), rtts, ip: ipm ? ipm[1] : null, best: valid.length ? Math.min(...valid) : null });
  }
  return hops;
}

/** Grade like the common bufferbloat tests: added latency under load (ms). */
export function gradeBufferbloat(idleMs, loadedMs) {
  if (!Number.isFinite(idleMs) || !Number.isFinite(loadedMs)) return { added: null, grade: '?' };
  const added = Math.max(0, round1(loadedMs - idleMs));
  const grade = added < 5 ? 'A+' : added < 30 ? 'A' : added < 60 ? 'B' : added < 200 ? 'C' : added < 400 ? 'D' : 'F';
  return { added, grade };
}

/**
 * Largest ICMP payload that passes with Don't Fragment set (binary search). probe(size) -> Promise<boolean>.
 * Returns { payload, mtu (= payload + 28 for IPv4), probes }.
 */
export async function findMaxPayload(probe, { lo = 548, hi = 1472 } = {}) {
  let probes = 0;
  const p = async (s) => { probes += 1; return Boolean(await probe(s)); };
  if (await p(hi)) return { payload: hi, mtu: hi + 28, probes };
  if (!(await p(lo))) return { payload: null, mtu: null, probes };
  let good = lo;
  let bad = hi;
  while (bad - good > 1) {
    const mid = Math.floor((good + bad) / 2);
    if (await p(mid)) good = mid; else bad = mid;
  }
  return { payload: good, mtu: good + 28, probes };
}

// ------------------------------------------------------------------ tweak planning (pure)

export const ADAPTER_TWEAKS = {
  interruptModeration: { keyword: '*InterruptModeration', target: '0' },
  flowControl: { keyword: '*FlowControl', target: '0' }
};

export const ADAPTER_NAME_RE = /^[^'"`$|#\r\n]{1,120}$/;
export const EXE_RE = /^[A-Za-z0-9 _.()+-]{1,96}\.exe$/i;

export function qosPolicyName(exe) {
  return `DarkHub NetX ${String(exe).toLowerCase()}`;
}

/**
 * adapters: [{ name, props: { '*InterruptModeration': { value, valid: [] } } }]
 * Returns the adapters where `keyword` exists, accepts `target` and is not already at it.
 */
export function planAdapterTweak(adapters, keyword, target) {
  const ops = [];
  for (const a of adapters || []) {
    if (!ADAPTER_NAME_RE.test(String(a?.name || ''))) continue;
    const p = a?.props?.[keyword];
    if (!p || p.value === null || p.value === undefined || p.value === '') continue;
    const valid = Array.isArray(p.valid) ? p.valid.map(String) : [];
    if (valid.length && !valid.includes(String(target))) continue;
    if (String(p.value) === String(target)) continue;
    ops.push({ name: a.name, keyword, before: String(p.value), value: String(target) });
  }
  return ops;
}

/** Keeps the oldest known value per adapter+keyword (applying twice must not make our value the "original"). */
export function mergeSnapshot(prev, ops) {
  const list = Array.isArray(prev) ? [...prev] : [];
  for (const op of ops) {
    if (!list.some((e) => e.name === op.name && e.keyword === op.keyword)) list.push({ name: op.name, keyword: op.keyword, value: op.before });
  }
  return list;
}

export function buildAdvancedPropertySetScript(entries) {
  const lines = [];
  for (const e of entries) {
    if (!ADAPTER_NAME_RE.test(String(e.name)) || !/^\*[A-Za-z]{2,40}$/.test(String(e.keyword)) || !/^-?\d{1,6}$/.test(String(e.value))) continue;
    lines.push(`Set-NetAdapterAdvancedProperty -Name ${psQuote(e.name)} -RegistryKeyword ${psQuote(e.keyword)} -RegistryValue ${Number(e.value)} -ErrorAction Stop`);
    lines.push(`Write-Output ('DHAFT|' + ${psQuote(`${e.name}#${e.keyword}`)} + '|' + [string]((Get-NetAdapterAdvancedProperty -Name ${psQuote(e.name)} -AllProperties | Where-Object { $_.RegistryKeyword -eq ${psQuote(e.keyword)} } | Select-Object -First 1).RegistryValue | Select-Object -First 1))`);
  }
  return lines.join('\r\n');
}

export function buildQosApplyScript(exe, dscp = 46) {
  if (!EXE_RE.test(String(exe))) throw new Error('Nome de executável inválido (ex.: cs2.exe).');
  const d = Number(dscp);
  if (!Number.isInteger(d) || d < 0 || d > 63) throw new Error('DSCP deve estar entre 0 e 63.');
  const name = qosPolicyName(exe);
  return `$n = ${psQuote(name)}
Get-NetQosPolicy -Name $n -ErrorAction SilentlyContinue | Remove-NetQosPolicy -Confirm:$false -ErrorAction SilentlyContinue
New-NetQosPolicy -Name $n -AppPathNameMatchCondition ${psQuote(exe)} -IPProtocolMatchCondition Both -NetworkProfile All -DSCPAction ${d} -ErrorAction Stop | Out-Null
$p = Get-NetQosPolicy -Name $n -ErrorAction Stop
Write-Output ('DHAFT|dscp|' + $p.DSCPValue)`;
}

export function isEcnValue(v) {
  return v === 'Enabled' || v === 'Disabled';
}

// ------------------------------------------------------------------ OS access

const EXTRA = (id) => `netx:${id}`;
const ICMP_TIMEOUT = 1000;

function runPing(args, timeoutMs) {
  return runCommand('ping.exe', args, { timeoutMs, encoding: 'latin1' })
    .then((r) => String(r.stdout || '') + String(r.stderr || ''))
    .catch(() => '');
}

function tcpConnectMs(host, port = 443, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const sock = net.connect({ host, port });
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { sock.destroy(); } catch { /* ignore */ } resolve(v); };
    sock.setTimeout(timeoutMs, () => finish(null));
    sock.once('connect', () => finish(Number(process.hrtime.bigint() - start) / 1e6));
    sock.once('error', () => finish(null));
  });
}

const STATE_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
$kw = @('*InterruptModeration','*FlowControl','*EEE')
$ads = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' })
$list = @()
foreach ($a in $ads) {
  $props = @{}
  $all = @(Get-NetAdapterAdvancedProperty -Name $a.Name -AllProperties -ErrorAction SilentlyContinue)
  foreach ($k in $kw) {
    $p = $all | Where-Object { $_.RegistryKeyword -eq $k } | Select-Object -First 1
    if ($p) { $props[$k] = [pscustomobject]@{ value = [string]($p.RegistryValue | Select-Object -First 1); display = [string]$p.DisplayValue; valid = @($p.ValidRegistryValues | ForEach-Object { [string]$_ }) } }
  }
  $pm = $null
  try { $pm = [string](Get-NetAdapterPowerManagement -Name $a.Name -ErrorAction Stop).AllowComputerToTurnOffDevice } catch { $pm = 'Unsupported' }
  $mtu = (Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).NlMtu
  $ik = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $a.InterfaceGuid
  $ip = Get-ItemProperty -LiteralPath $ik -ErrorAction SilentlyContinue
  $list += [pscustomobject]@{ name = $a.Name; description = $a.InterfaceDescription; linkSpeed = [string]$a.LinkSpeed; mtu = $mtu; props = $props; power = $pm; tcpAckFrequency = $ip.TcpAckFrequency; tcpNoDelay = $ip.TCPNoDelay }
}
$t = Get-NetTCPSetting -SettingName InternetCustom -ErrorAction SilentlyContinue
$o = Get-NetOffloadGlobalSetting -ErrorAction SilentlyContinue
$mm = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile' -ErrorAction SilentlyContinue
$qos = @(Get-NetQosPolicy -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'DarkHub NetX *' } | ForEach-Object { [pscustomobject]@{ name = $_.Name; app = [string]$_.AppPathName; dscp = $_.DSCPValue } })
[pscustomobject]@{
  adapters = $list
  tcp = [pscustomobject]@{ ecn = [string]$t.EcnCapability; autotuning = [string]$t.AutoTuningLevelLocal; timestamps = [string]$t.Timestamps }
  offload = [pscustomobject]@{ rss = [string]$o.ReceiveSideScaling; rsc = [string]$o.ReceiveSegmentCoalescing }
  mmcss = [pscustomobject]@{ networkThrottlingIndex = $mm.NetworkThrottlingIndex; systemResponsiveness = $mm.SystemResponsiveness }
  qos = $qos
} | ConvertTo-Json -Depth 6 -Compress`;

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Normalizes the JSON of STATE_SCRIPT (ConvertTo-Json collapses single-item arrays). */
export function normalizeState(raw) {
  const adapters = asArray(raw?.adapters).map((a) => {
    const props = {};
    for (const [k, p] of Object.entries(a?.props || {})) {
      props[k] = { value: p?.value ?? null, display: p?.display ?? '', valid: asArray(p?.valid).map(String) };
    }
    return {
      name: String(a?.name || ''),
      description: String(a?.description || ''),
      linkSpeed: String(a?.linkSpeed || ''),
      mtu: Number.isFinite(Number(a?.mtu)) && a?.mtu !== null ? Number(a.mtu) : null,
      props,
      power: a?.power ? String(a.power) : 'Unsupported',
      tcpAckFrequency: a?.tcpAckFrequency ?? null,
      tcpNoDelay: a?.tcpNoDelay ?? null
    };
  }).filter((a) => a.name);
  return {
    adapters,
    tcp: { ecn: raw?.tcp?.ecn || '', autotuning: raw?.tcp?.autotuning || '', timestamps: raw?.tcp?.timestamps || '' },
    offload: { rss: raw?.offload?.rss || '', rsc: raw?.offload?.rsc || '' },
    mmcss: { networkThrottlingIndex: raw?.mmcss?.networkThrottlingIndex ?? null, systemResponsiveness: raw?.mmcss?.systemResponsiveness ?? null },
    qos: asArray(raw?.qos).map((q) => ({ name: String(q?.name || ''), app: String(q?.app || ''), dscp: q?.dscp ?? null })).filter((q) => q.name)
  };
}

const TWEAK_IDS = ['interruptModeration', 'flowControl', 'powerSaving', 'ecn', 'qos'];

class NetLatencyService {
  _runMarked(script, timeoutMs = 120000) {
    return ElevationHelper.runMarked(script, timeoutMs);
  }

  getPresets() {
    return LATENCY_PRESETS;
  }

  /** One latency sample: ICMP (ping.exe, IPv4) or TCP handshake time to port 443. */
  async probe({ host, mode } = {}) {
    const h = assertSafeHost(host);
    if (mode === 'tcp') {
      const ms = await tcpConnectMs(h, 443, 2000);
      return { ok: true, ms: ms === null ? null : round1(ms), mode: 'tcp' };
    }
    const out = await runPing(['-4', '-n', '1', '-w', String(ICMP_TIMEOUT), h], 5000);
    const t = parsePingOutput(out);
    return { ok: true, ms: t.length ? t[0] : null, mode: 'icmp' };
  }

  async traceroute({ host, maxHops } = {}) {
    const h = assertSafeHost(host);
    const hops = Math.max(1, Math.min(30, Math.trunc(Number(maxHops) || 20)));
    const r = await runCommand('tracert.exe', ['-d', '-4', '-h', String(hops), '-w', '700', h], { timeoutMs: hops * 3 * 900 + 15000, encoding: 'latin1' });
    const output = String(r.stdout || '') + String(r.stderr || '');
    return { ok: true, hops: parseTracertOutput(output), output };
  }

  /** Idle ping, then ping while 2 parallel HTTPS downloads saturate the link. ~20 s. */
  async bufferbloat({ host = '1.1.1.1', seconds = 10 } = {}) {
    const h = assertSafeHost(host);
    const n = Math.max(5, Math.min(20, Math.trunc(Number(seconds) || 10)));
    const idleOut = await runPing(['-4', '-n', '8', '-w', String(ICMP_TIMEOUT), h], 20000);
    const idle = parsePingOutput(idleOut);

    let bytes = 0;
    let stopped = false;
    let httpError = '';
    const reqs = new Set();
    const started = Date.now();
    // speed.cloudflare.com refuses (403) single downloads above ~25 MB, so chain 25 MB requests on 3 parallel streams.
    const startDownload = () => {
      if (stopped) return;
      const req = https.get('https://speed.cloudflare.com/__down?bytes=25000000', { headers: { 'User-Agent': 'DarkHub' } }, (res) => {
        if (res.statusCode !== 200) { httpError = `HTTP ${res.statusCode}`; res.resume(); reqs.delete(req); return; }
        res.on('data', (c) => { bytes += c.length; });
        res.on('end', () => { reqs.delete(req); startDownload(); }); // keep the pipe full on fast links
        res.on('error', () => {});
      });
      req.on('error', (e) => { httpError = httpError || e?.message || 'erro'; reqs.delete(req); });
      reqs.add(req);
    };
    for (let i = 0; i < 3; i += 1) startDownload();
    await new Promise((r) => setTimeout(r, 1500)); // let TCP ramp up before sampling
    const loadedOut = await runPing(['-4', '-n', String(n), '-w', String(ICMP_TIMEOUT), h], (n + 5) * 1500);
    const elapsed = (Date.now() - started) / 1000;
    stopped = true;
    for (const q of reqs) { try { q.destroy(); } catch { /* ignore */ } }
    const loaded = parsePingOutput(loadedOut);
    if (bytes < 1e6) return { ok: false, error: `Não foi possível gerar carga (download de speed.cloudflare.com falhou${httpError ? `: ${httpError}` : ''}); o resultado não seria válido.` };

    const idleStats = computeLatencyStats([...idle, ...Array(Math.max(0, 8 - idle.length)).fill(null)]);
    const loadedStats = computeLatencyStats([...loaded, ...Array(Math.max(0, n - loaded.length)).fill(null)]);
    if (!idle.length) return { ok: false, error: `O host ${h} não respondeu ao ping (ICMP). Escolha outro host.` };
    const g = gradeBufferbloat(idleStats.median, loadedStats.median);
    return { ok: true, host: h, idle: idleStats, loaded: loadedStats, idleSamples: idle, loadedSamples: loaded, downMbps: round1((bytes * 8) / 1e6 / Math.max(0.1, elapsed)), ...g };
  }

  async mtu({ host = '1.1.1.1' } = {}) {
    const h = assertSafeHost(host);
    const base = parsePingOutput(await runPing(['-4', '-n', '1', '-w', String(ICMP_TIMEOUT), h], 5000));
    if (!base.length) return { ok: false, error: `O host ${h} não respondeu ao ping (ICMP). Escolha outro host.` };
    const probe = async (size) => parsePingOutput(await runPing(['-4', '-f', '-l', String(size), '-n', '1', '-w', String(ICMP_TIMEOUT), h], 5000)).length > 0;
    const r = await findMaxPayload(probe);
    if (r.mtu === null) return { ok: false, error: 'Nenhum tamanho entre 576 e 1500 passou sem fragmentar (ICMP filtrado no caminho?).' };
    return { ok: true, host: h, ...r };
  }

  async getState() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const r = await runPowerShell(STATE_SCRIPT, { timeoutMs: 30000, trim: true });
      if (!r.stdout) return { ok: false, error: r.stderr || 'Falha ao ler o estado da rede' };
      const state = normalizeState(JSON.parse(r.stdout));
      const saved = {};
      for (const id of TWEAK_IDS) saved[id] = Boolean(DeepTweaksEngine.getExtra(EXTRA(id)));
      return { ok: true, ...state, saved, elevated: await ElevationHelper.isElevated() };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async applyTweak({ id, value, exe } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const st = await this.getState();
    if (!st.ok) return st;

    if (ADAPTER_TWEAKS[id]) {
      const { keyword, target } = ADAPTER_TWEAKS[id];
      const ops = planAdapterTweak(st.adapters, keyword, target);
      if (!ops.length) return { ok: true, msg: 'Nada a mudar: os adaptadores não expõem essa opção ou ela já está desligada.', changed: 0 };
      DeepTweaksEngine.saveExtra(EXTRA(id), mergeSnapshot(DeepTweaksEngine.getExtra(EXTRA(id)), ops));
      const r = await this._runMarked(buildAdvancedPropertySetScript(ops), 90000);
      if (!r.ok) return { ok: false, error: r.error };
      const after = parseDhSnapLines(r.out, 'DHAFT');
      const bad = ops.filter((o) => String(after[`${o.name}#${o.keyword}`]) !== o.value);
      if (bad.length) return { ok: false, error: `O driver não confirmou a mudança em: ${bad.map((b) => b.name).join(', ')}` };
      return { ok: true, verified: true, changed: ops.length, msg: `Aplicado e verificado em ${ops.map((o) => o.name).join(', ')}. A conexão pode piscar por 1 a 3 segundos.` };
    }

    if (id === 'powerSaving') {
      const targets = st.adapters.filter((a) => a.power === 'Enabled' && ADAPTER_NAME_RE.test(a.name));
      if (!targets.length) return { ok: true, msg: 'Nada a mudar: nenhum adaptador permite que o Windows o desligue (ou o driver não expõe a opção).', changed: 0 };
      const prev = asArray(DeepTweaksEngine.getExtra(EXTRA(id)));
      const snap = [...prev];
      for (const a of targets) if (!snap.some((e) => e.name === a.name)) snap.push({ name: a.name, value: 'Enabled' });
      DeepTweaksEngine.saveExtra(EXTRA(id), snap);
      const script = targets.map((a) => `Set-NetAdapterPowerManagement -Name ${psQuote(a.name)} -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop
Write-Output ('DHAFT|' + ${psQuote(a.name)} + '|' + [string](Get-NetAdapterPowerManagement -Name ${psQuote(a.name)}).AllowComputerToTurnOffDevice)`).join('\r\n');
      const r = await this._runMarked(script, 60000);
      if (!r.ok) return { ok: false, error: r.error };
      const after = parseDhSnapLines(r.out, 'DHAFT');
      const bad = targets.filter((a) => after[a.name] !== 'Disabled');
      if (bad.length) return { ok: false, error: `O Windows não confirmou em: ${bad.map((b) => b.name).join(', ')}` };
      return { ok: true, verified: true, changed: targets.length, msg: `O Windows não desliga mais ${targets.map((a) => a.name).join(', ')} para economizar energia.` };
    }

    if (id === 'ecn') {
      if (!isEcnValue(value)) return { ok: false, error: 'Valor de ECN inválido (Enabled ou Disabled).' };
      const before = st.tcp.ecn;
      if (!isEcnValue(before)) return { ok: false, error: 'Não foi possível ler o ECN atual (modelo TCP InternetCustom).' };
      if (before === value) return { ok: true, msg: `ECN já está ${value === 'Enabled' ? 'ligado' : 'desligado'}.`, changed: 0 };
      if (!DeepTweaksEngine.getExtra(EXTRA(id))) DeepTweaksEngine.saveExtra(EXTRA(id), { ecn: before });
      const r = await this._runMarked(`Set-NetTCPSetting -SettingName InternetCustom -EcnCapability ${value} -ErrorAction Stop
Write-Output ('DHAFT|ecn|' + [string](Get-NetTCPSetting -SettingName InternetCustom).EcnCapability)`, 60000);
      if (!r.ok) return { ok: false, error: r.error };
      if (parseDhSnapLines(r.out, 'DHAFT').ecn !== value) return { ok: false, error: 'O Windows não confirmou o ECN.' };
      return { ok: true, verified: true, changed: 1, msg: `ECN ${value === 'Enabled' ? 'ligado' : 'desligado'} e verificado (vale para novas conexões).` };
    }

    if (id === 'qos') {
      let script;
      try { script = buildQosApplyScript(String(exe || '').trim()); } catch (e) { return { ok: false, error: e.message }; }
      const name = qosPolicyName(String(exe).trim());
      const snap = asArray(DeepTweaksEngine.getExtra(EXTRA(id)));
      if (!snap.includes(name)) DeepTweaksEngine.saveExtra(EXTRA(id), [...snap, name]);
      const r = await this._runMarked(script, 60000);
      if (!r.ok) return { ok: false, error: r.error };
      if (String(parseDhSnapLines(r.out, 'DHAFT').dscp) !== '46') return { ok: false, error: 'O Windows não confirmou a política de QoS.' };
      return { ok: true, verified: true, changed: 1, msg: `Política "${name}" criada: o tráfego de ${exe} sai marcado com DSCP 46 (EF). Só ajuda se o roteador respeitar DSCP.` };
    }

    return { ok: false, error: 'Ajuste desconhecido.' };
  }

  async restoreTweak({ id } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const snap = DeepTweaksEngine.getExtra(EXTRA(id));
    if (!snap) return { ok: false, error: 'Não há valor anterior salvo para restaurar.' };

    let r;
    if (ADAPTER_TWEAKS[id]) {
      const script = buildAdvancedPropertySetScript(asArray(snap));
      if (!script) { DeepTweaksEngine.clearExtra(EXTRA(id)); return { ok: true, msg: 'Nada a restaurar.' }; }
      r = await this._runMarked(script, 90000);
      if (r.ok) {
        const after = parseDhSnapLines(r.out, 'DHAFT');
        const bad = asArray(snap).filter((e) => String(after[`${e.name}#${e.keyword}`]) !== String(e.value));
        if (bad.length) return { ok: false, error: `O driver não confirmou a restauração em: ${bad.map((b) => b.name).join(', ')}` };
      }
    } else if (id === 'powerSaving') {
      const list = asArray(snap).filter((e) => ADAPTER_NAME_RE.test(String(e?.name || '')) && (e.value === 'Enabled' || e.value === 'Disabled'));
      r = await this._runMarked(list.map((e) => `Set-NetAdapterPowerManagement -Name ${psQuote(e.name)} -AllowComputerToTurnOffDevice ${e.value} -ErrorAction Stop`).join('\r\n') || 'Write-Output nothing', 60000);
    } else if (id === 'ecn') {
      if (!isEcnValue(snap.ecn)) return { ok: false, error: 'Valor anterior inválido.' };
      r = await this._runMarked(`Set-NetTCPSetting -SettingName InternetCustom -EcnCapability ${snap.ecn} -ErrorAction Stop`, 60000);
    } else if (id === 'qos') {
      const names = asArray(snap).filter((n) => /^DarkHub NetX [A-Za-z0-9 _.()+-]{1,96}\.exe$/i.test(String(n)));
      r = await this._runMarked(names.map((n) => `Get-NetQosPolicy -Name ${psQuote(n)} -ErrorAction SilentlyContinue | Remove-NetQosPolicy -Confirm:$false -ErrorAction Stop`).join('\r\n') || 'Write-Output nothing', 60000);
    } else {
      return { ok: false, error: 'Ajuste desconhecido.' };
    }
    if (!r.ok) return { ok: false, error: r.error };
    DeepTweaksEngine.clearExtra(EXTRA(id));
    return { ok: true, msg: 'Restaurado para o valor anterior.' };
  }

  /** netsh winsock reset + int ip reset (elevated). Not reversible; needs a reboot. */
  async resetStack() {
    if (process.platform !== 'win32') return { ok: false, output: 'Only Windows supported' };
    const r = await this._runMarked(`& netsh.exe winsock reset
DhCheck 'netsh winsock reset'
& netsh.exe int ip reset | Out-Null
& ipconfig.exe /flushdns | Out-Null`, 120000);
    const output = r.out.replace(/^DH(DONE|FAIL).*$/gm, '').trim();
    if (!r.ok) return { ok: false, output: `${output}\n${r.error}`.trim() };
    return { ok: true, requiresReboot: true, output: `${output}\n\nWinsock e TCP/IP redefinidos. REINICIE o Windows para concluir.`.trim() };
  }
}

export { NetLatencyService };
export default new NetLatencyService();
