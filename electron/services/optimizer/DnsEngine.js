import dgram from 'node:dgram';
import crypto from 'node:crypto';
import ElevationHelper from './ElevationHelper.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import { runPowerShell } from '../PowerShellRunner.js';
import { isValidIpv4, medianFinite, psQuote } from './OptimizerUtils.js';

/** Well known public resolvers whose operator is identifiable. Anything else is flagged as "not verified" in the UI. */
export const DNS_PRESETS = [
  { name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', trusted: true },
  { name: 'Google DNS', primary: '8.8.8.8', secondary: '8.8.4.4', trusted: true },
  { name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220', trusted: true },
  { name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', trusted: true },
  { name: 'AdGuard DNS', primary: '94.140.14.14', secondary: '94.140.15.15', trusted: true },
  { name: 'Level3', primary: '209.244.0.3', secondary: '209.244.0.4', trusted: true },
  { name: 'Verisign', primary: '64.6.64.6', secondary: '64.6.65.6', trusted: true },
  { name: 'DNS.Watch', primary: '84.200.69.80', secondary: '84.200.70.40', trusted: true },
  { name: 'Comodo Secure DNS', primary: '8.26.56.26', secondary: '8.20.247.20', trusted: true },
  { name: 'Dyn', primary: '216.146.35.35', secondary: '216.146.36.36', trusted: true },
  { name: 'UncensoredDNS', primary: '91.239.100.100', secondary: '89.233.43.71', trusted: true },
  { name: 'Hurricane Electric', primary: '74.82.42.42', secondary: '204.9.214.118', trusted: true },
  { name: 'DNS Brasil 1', primary: '177.128.247.77', secondary: '189.2.9.181', trusted: false },
  { name: 'DNS Brasil 2', primary: '181.217.154.102', secondary: '186.209.180.156', trusted: false },
  { name: 'DNS Brasil 3', primary: '45.65.173.61', secondary: '177.99.206.131', trusted: false },
  { name: 'DNS Brasil 4', primary: '187.102.222.46', secondary: '168.195.243.35', trusted: false },
  { name: 'DNS EUA 1', primary: '205.171.3.66', secondary: '204.9.214.118', trusted: false },
  { name: 'DNS EUA 2', primary: '172.64.36.143', secondary: '75.85.76.64', trusted: false },
  { name: 'DNS EUA 3', primary: '172.64.37.210', secondary: '76.72.180.231', trusted: false },
  { name: 'DNS EUA 4', primary: '66.92.224.2', secondary: '8.20.247.148', trusted: false },
  { name: 'DNS EUA 5', primary: '73.99.97.167', secondary: '65.220.16.3', trusted: false }
];

/** A resolver IP we are willing to configure: public-looking unicast IPv4 only. */
export function isUsableDnsServer(ip) {
  if (!isValidIpv4(ip)) return false;
  const [a] = String(ip).trim().split('.').map(Number);
  if (a === 0 || a === 127 || a >= 224) return false;
  return String(ip).trim() !== '255.255.255.255';
}

export function buildDnsQuery(id, hostname = 'www.google.com') {
  const labels = String(hostname).split('.').filter(Boolean);
  const parts = [Buffer.from([(id >> 8) & 0xff, id & 0xff, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])];
  for (const l of labels) parts.push(Buffer.from([l.length]), Buffer.from(l, 'ascii'));
  parts.push(Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01]));
  return Buffer.concat(parts);
}

/** A reply only counts when it answers OUR query, has QR=1, RCODE=0 and at least one answer record. */
export function isValidDnsAnswer(msg, id) {
  if (!msg || msg.length < 12) return false;
  if (((msg[0] << 8) | msg[1]) !== id) return false;
  const qr = (msg[2] & 0x80) !== 0;
  const rcode = msg[3] & 0x0f;
  const ancount = (msg[6] << 8) | msg[7];
  return qr && rcode === 0 && ancount > 0;
}

function dnsLatencyUdp(serverIp, timeoutMs, hostname) {
  return new Promise((resolve) => {
    const id = crypto.randomInt(0, 65536);
    const query = buildDnsQuery(id, hostname);
    const sock = dgram.createSocket('udp4');
    const start = process.hrtime.bigint();
    let done = false;
    const finish = (ms) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.close(); } catch { /* ignore */ }
      resolve(ms);
    };
    const timer = setTimeout(() => finish(Number.POSITIVE_INFINITY), timeoutMs);
    sock.once('error', () => finish(Number.POSITIVE_INFINITY));
    sock.on('message', (msg) => {
      if (isValidDnsAnswer(msg, id)) finish(Number(process.hrtime.bigint() - start) / 1e6);
    });
    sock.send(query, 53, serverIp, (err) => { if (err) finish(Number.POSITIVE_INFINITY); });
  });
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

class DnsEngine {
  getPresets() {
    return DNS_PRESETS;
  }

  /**
   * Measures real round-trip time of a valid DNS answer (one warm-up query is discarded so the resolver
   * cache does not distort the first sample). Servers that never answer correctly are reported as failed.
   */
  async benchmark({ timeoutMs, attempts, concurrency, servers } = {}) {
    const timeout = clampInt(timeoutMs, 300, 5000, 1500);
    const tries = clampInt(attempts, 1, 5, 3);
    const limit = clampInt(concurrency, 1, 16, 6);
    const list = (Array.isArray(servers) && servers.length ? servers : DNS_PRESETS).filter((s) => isUsableDnsServer(s?.primary));

    const results = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const idx = cursor++;
        const s = list[idx];
        await dnsLatencyUdp(s.primary, timeout, 'www.google.com'); // warm-up, discarded
        const samples = [];
        for (let i = 0; i < tries; i += 1) samples.push(await dnsLatencyUdp(s.primary, timeout, 'www.google.com'));
        const ok = samples.filter((x) => Number.isFinite(x));
        const med = medianFinite(samples);
        results[idx] = { ...s, latencyMs: Number.isFinite(med) ? Math.round(med * 10) / 10 : null, samples: samples.map((x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null)), successRate: ok.length / samples.length };
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));

    const good = results.filter((r) => r && r.latencyMs !== null && r.successRate >= 0.5).sort((a, b) => a.latencyMs - b.latencyMs);
    const failedList = results.filter((r) => r && !(r.latencyMs !== null && r.successRate >= 0.5)).map((r) => ({ name: r.name, primary: r.primary }));
    return { ok: true, results: good, failed: failedList.length, failedList };
  }

  async _psJson(script, timeoutMs = 20000) {
    const r = await runPowerShell(script, { timeoutMs, trim: true });
    if (r.code !== 0) throw new Error(r.stderr || 'PowerShell falhou');
    return r.stdout ? JSON.parse(r.stdout) : null;
  }

  async getActiveAdapter() {
    const ps = `
$ErrorActionPreference='Stop'
$a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
if ($null -eq $a) { 'null' } else { [pscustomobject]@{ name = $a.Name; guid = $a.InterfaceGuid } | ConvertTo-Json -Compress }`;
    return this._psJson(ps, 15000);
  }

  async _readServers(alias, guid) {
    const ps = `
$ErrorActionPreference='Stop'
$s = Get-DnsClientServerAddress -InterfaceAlias ${psQuote(alias)} -AddressFamily IPv4
$static = $null
try { $static = (Get-ItemProperty -LiteralPath ('HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + ${psQuote(guid)}) -Name NameServer -ErrorAction Stop).NameServer } catch {}
[pscustomobject]@{ servers = @($s.ServerAddresses); isStatic = [bool]$static } | ConvertTo-Json -Compress`;
    const data = await this._psJson(ps);
    return { servers: Array.isArray(data?.servers) ? data.servers : (data?.servers ? [data.servers] : []), isStatic: !!data?.isStatic };
  }

  async getState() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' };
    try {
      const adapter = await this.getActiveAdapter();
      if (!adapter) return { ok: false, error: 'Nenhum adaptador de rede físico ativo encontrado' };
      const st = await this._readServers(adapter.name, adapter.guid);
      return { ok: true, adapter: adapter.name, servers: st.servers, isStatic: st.isStatic, data: { adapter: adapter.name, servers: st.servers, isStatic: st.isStatic } };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  /** Applies DNS on the active adapter (needs administrator), reads it back and keeps a persistent undo. */
  async apply({ primary, secondary } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' };
    if (!isUsableDnsServer(primary) || !isUsableDnsServer(secondary)) return { ok: false, error: 'IP de servidor DNS inválido' };
    try {
      const adapter = await this.getActiveAdapter();
      if (!adapter) return { ok: false, error: 'Nenhum adaptador de rede físico ativo encontrado' };
      const before = await this._readServers(adapter.name, adapter.guid);
      const want = [String(primary).trim(), String(secondary).trim()];

      const script = `$ErrorActionPreference = 'Stop'\r\nSet-DnsClientServerAddress -InterfaceAlias ${psQuote(adapter.name)} -ServerAddresses @(${want.map(psQuote).join(',')})\r\nClear-DnsClientCache`;
      const res = await ElevationHelper.runElevatedPowerShell(script);
      if (res.code !== 0) return { ok: false, error: res.stderr || 'Falha ao aplicar DNS (UAC cancelado ou erro do Windows)' };

      const after = await this._readServers(adapter.name, adapter.guid);
      const verified = want.every((w) => after.servers.includes(w));
      if (!verified) return { ok: false, error: `O Windows não manteve o DNS solicitado (atual: ${after.servers.join(', ') || 'nenhum'})` };

      const undoToken = `dns_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      // Applying a second preset must not make the FIRST preset the "original": keep the pre-DarkHub DNS of this adapter.
      const prev = DeepTweaksEngine.getExtra('dns:last');
      const keepOriginal = prev && prev.adapter === adapter.name && Array.isArray(prev.servers);
      const entry = keepOriginal
        ? { adapter: adapter.name, guid: adapter.guid, servers: prev.servers, wasStatic: Boolean(prev.wasStatic) }
        : { adapter: adapter.name, guid: adapter.guid, servers: before.servers, wasStatic: before.isStatic };
      if (prev?.token && prev.token !== undoToken) DeepTweaksEngine.clearExtra(prev.token); // superseded (undo falls back to dns:last)
      DeepTweaksEngine.saveExtra(undoToken, entry);
      DeepTweaksEngine.saveExtra('dns:last', { token: undoToken, ...entry });
      return {
        ok: true,
        msg: `DNS aplicado e verificado no adaptador ${adapter.name}: ${want.join(' / ')} (somente IPv4).`,
        adapter: adapter.name,
        before: before.servers,
        after: after.servers,
        verified: true,
        undoToken
      };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  async undo({ undoToken } = {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only supported on Windows' };
    const entry = (undoToken && DeepTweaksEngine.getExtra(undoToken)) || DeepTweaksEngine.getExtra('dns:last');
    if (!entry) return { ok: false, error: 'Undo token inválido ou expirado' };
    try {
      const staticServers = (entry.servers || []).filter(isValidIpv4);
      const restore = entry.wasStatic && staticServers.length
        ? `Set-DnsClientServerAddress -InterfaceAlias ${psQuote(entry.adapter)} -ServerAddresses @(${staticServers.map(psQuote).join(',')})`
        : `Set-DnsClientServerAddress -InterfaceAlias ${psQuote(entry.adapter)} -ResetServerAddresses`;
      const res = await ElevationHelper.runElevatedPowerShell(`$ErrorActionPreference = 'Stop'\r\n${restore}\r\nClear-DnsClientCache`);
      if (res.code !== 0) return { ok: false, error: res.stderr || 'Falha ao restaurar o DNS' };
      const after = await this._readServers(entry.adapter, entry.guid);
      if (undoToken) DeepTweaksEngine.clearExtra(undoToken);
      DeepTweaksEngine.clearExtra('dns:last');
      return { ok: true, msg: `DNS restaurado no adaptador ${entry.adapter} (${entry.wasStatic ? 'servidores manuais anteriores' : 'automático/DHCP'}).`, adapter: entry.adapter, servers: after.servers };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }
}

export default new DnsEngine();
