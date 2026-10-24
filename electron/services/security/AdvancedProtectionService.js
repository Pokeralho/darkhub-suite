// Advanced Security: community blocklists (hosts / firewall / malware hashes) and Windows hardening toggles.
// Every change reads the current state first, keeps the previous state in userData and has an exact Restore.
// Downloaded lists are parsed as data only; nothing downloaded is ever executed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import Logger from '../LoggerService.js';
import { runPowerShell, parseJsonOutput } from '../PowerShellRunner.js';
import ElevationHelper from '../optimizer/ElevationHelper.js';
import { parseDhSnapLines, parseDhResults } from '../optimizer/OptimizerUtils.js';
import { FEED_SOURCES, getFeedSource, isAllowedFeedUrl } from './feedSources.js';
import {
  parseFeed, looksLikeHtml, mergeManagedBlock, removeManagedBlock, readManagedBlockInfo, buildHostsWriteScript,
  buildFirewallApplyScript, buildFirewallRemoveScript, buildFirewallStatusScript, parseFirewallCount,
  sanitizeFirewallAddresses, buildIpMatcher, HOSTS_WARN_ENTRIES, FIREWALL_GROUP, normalizeDomain
} from './feedParsers.js';
import {
  HARDENING_ITEMS, getHardeningItem, buildHardeningStatusScript, evaluateHardening, defenderActive,
  buildHardeningApplyScript, buildHardeningRestoreScript, parseHardeningSnapshot
} from './hardeningCatalog.js';

const TAG = 'AdvancedProtection';
const HOSTS_PATH = path.join(process.env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');

/** Reads a fetch() body up to maxBytes; aborts (and throws) above it. */
export async function readCapped(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`too-large (${declared} bytes)`);
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`too-large (${buf.length} bytes)`);
    return buf;
  }
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new Error(`too-large (> ${maxBytes} bytes)`);
    }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

export class AdvancedProtectionService {
  constructor({ dataDir = null, securityService = null, hostsPath = HOSTS_PATH, fetchImpl = null } = {}) {
    this.dataDir = dataDir;
    this.securityService = securityService;
    this.hostsPath = hostsPath;
    this.fetchImpl = fetchImpl;
    this._state = null;
    this._busy = null;
    this._domainSet = null;
    this._ipMatcher = null;
  }

  setDataDir(dir) { this.dataDir = dir; this._state = null; }

  // ---------------------------------------------------------------- persistence

  _dir(...p) {
    const base = this.dataDir || path.join(process.env.APPDATA || os.tmpdir(), 'DarkHub');
    const dir = path.join(base, 'security-advanced', ...p);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  _statePath() { return path.join(this._dir(), 'state.json'); }

  _loadState() {
    if (this._state) return this._state;
    let s = {};
    try { s = JSON.parse(fs.readFileSync(this._statePath(), 'utf8')) || {}; } catch { s = {}; }
    s.enabled ||= {};
    s.feeds ||= {};
    s.hardening ||= {};
    for (const src of FEED_SOURCES) if (typeof s.enabled[src.id] !== 'boolean') s.enabled[src.id] = src.defaultEnabled === true;
    this._state = s;
    return s;
  }

  _saveState() {
    const tmp = `${this._statePath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
    fs.renameSync(tmp, this._statePath());
  }

  _cachePath(id) { return path.join(this._dir('feeds'), `${id}.json`); }

  _readCache(id) {
    try { return JSON.parse(fs.readFileSync(this._cachePath(id), 'utf8')); } catch { return null; }
  }

  async _exclusive(name, fn) {
    if (this._busy) return { ok: false, error: 'busy', busyWith: this._busy };
    this._busy = name;
    try { return await fn(); } finally { this._busy = null; }
  }

  // ---------------------------------------------------------------- feeds

  listSources() {
    const st = this._loadState();
    return FEED_SOURCES.map((s) => ({
      id: s.id, kind: s.kind, format: s.format, name: s.name, url: s.url, homepage: s.homepage, license: s.license,
      note: s.note || null, enabled: st.enabled[s.id] === true,
      ...(st.feeds[s.id] || { updatedAt: null, count: 0, upstreamDate: null, bytes: 0, error: null })
    }));
  }

  setEnabled(id, enabled) {
    if (!getFeedSource(id)) return { ok: false, error: 'unknown-source' };
    const st = this._loadState();
    st.enabled[id] = Boolean(enabled);
    this._saveState();
    this._domainSet = null;
    this._ipMatcher = null;
    return { ok: true, sources: this.listSources() };
  }

  async _download(source) {
    const doFetch = this.fetchImpl || globalThis.fetch;
    const urls = [source.url, ...(source.mirrors || [])];
    let lastErr = null;
    for (const url of urls) {
      if (!isAllowedFeedUrl(url)) { lastErr = new Error('url-not-allowed'); continue; }
      try {
        const res = await doFetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(90000),
          headers: { 'User-Agent': 'DarkHub-Suite (community blocklists)', Accept: 'text/plain,*/*' }
        });
        if (res.url && !isAllowedFeedUrl(res.url)) throw new Error(`redirected to a host that is not allowed: ${new URL(res.url).hostname}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await readCapped(res, source.maxBytes || 8 * 1024 * 1024);
        const text = buf.toString('utf8');
        if (looksLikeHtml(text)) throw new Error('server returned an HTML page instead of a list');
        return { text, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), url };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('download failed');
  }

  async updateFeeds(ids) {
    const st = this._loadState();
    const wanted = (Array.isArray(ids) && ids.length ? ids : FEED_SOURCES.filter((s) => st.enabled[s.id]).map((s) => s.id))
      .map((id) => getFeedSource(id)).filter(Boolean);
    const results = [];
    const queue = [...wanted];
    const worker = async () => {
      for (let src = queue.shift(); src; src = queue.shift()) {
        try {
          const dl = await this._download(src);
          const parsed = parseFeed(src, dl.text);
          if (parsed.count === 0) throw new Error('the list has no valid entries');
          fs.writeFileSync(this._cachePath(src.id), JSON.stringify(parsed.entries), 'utf8');
          st.feeds[src.id] = { updatedAt: new Date().toISOString(), count: parsed.count, upstreamDate: parsed.upstreamDate, bytes: dl.bytes, sha256: dl.sha256, fetchedFrom: dl.url, error: null };
          results.push({ id: src.id, ok: true, count: parsed.count });
        } catch (e) {
          const msg = String(e?.message || e).slice(0, 200);
          st.feeds[src.id] = { ...(st.feeds[src.id] || {}), error: msg, errorAt: new Date().toISOString() };
          results.push({ id: src.id, ok: false, error: msg });
          Logger.warn(TAG, `feed ${src.id} failed: ${msg}`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    this._saveState();
    this._domainSet = null;
    this._ipMatcher = null;
    return { ok: results.every((r) => r.ok), results, sources: this.listSources() };
  }

  /** Entries of the enabled feeds of a kind; downloads the ones that were never fetched. */
  async _collect(kind) {
    const st = this._loadState();
    const srcs = FEED_SOURCES.filter((s) => s.kind === kind && st.enabled[s.id]);
    const missing = srcs.filter((s) => !this._readCache(s.id));
    if (missing.length) await this.updateFeeds(missing.map((s) => s.id));
    const used = [];
    const entries = [];
    for (const s of srcs) {
      const cached = this._readCache(s.id);
      if (Array.isArray(cached) && cached.length) { used.push(s.id); for (const e of cached) entries.push(e); }
    }
    return { sources: used, entries };
  }

  // ---------------------------------------------------------------- hosts

  _readHosts() {
    try { return fs.readFileSync(this.hostsPath, 'utf8'); } catch (e) {
      if (e?.code === 'ENOENT') return '';
      throw e;
    }
  }

  _backupHosts(content) {
    const dir = this._dir('hosts-backups');
    const original = path.join(dir, 'hosts.before-darkhub.bak');
    if (!fs.existsSync(original)) fs.writeFileSync(original, content, 'utf8');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const p = path.join(dir, `hosts-${stamp}.bak`);
    fs.writeFileSync(p, content, 'utf8');
    const all = fs.readdirSync(dir).filter((f) => /^hosts-.*\.bak$/.test(f)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - 5))) { try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ } }
    return p;
  }

  async _writeHosts(content) {
    if (process.platform !== 'win32') return { ok: false, error: 'windows-only' };
    const dir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DarkHub', 'elevate');
    fs.mkdirSync(dir, { recursive: true });
    const staged = path.join(dir, `hosts_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.txt`);
    const buf = Buffer.from(content, 'utf8');
    fs.writeFileSync(staged, buf);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    try {
      return await ElevationHelper.runMarked(buildHostsWriteScript({ stagedPath: staged, sha256, hostsPath: this.hostsPath }), 180000);
    } finally {
      try { fs.unlinkSync(staged); } catch { /* removed by the script */ }
    }
  }

  hostsStatus() {
    try {
      const info = readManagedBlockInfo(this._readHosts());
      const st = this._loadState();
      return { ok: true, ...info, appliedAt: st.hosts?.appliedAt || null, warnAbove: HOSTS_WARN_ENTRIES };
    } catch (e) {
      return { ok: false, present: false, entries: 0, error: e?.message || String(e) };
    }
  }

  applyHosts() {
    return this._exclusive('hosts', async () => {
      const { sources, entries } = await this._collect('hosts');
      if (!entries.length) return { ok: false, error: 'no-entries' };
      const current = this._readHosts();
      const merged = mergeManagedBlock(current, entries, { sources, updatedAt: new Date().toISOString() });
      if (!merged.ok) return { ok: false, error: merged.error === 'too-many' ? `too-many:${merged.count}:${merged.max}` : merged.error };
      const backupPath = this._backupHosts(current);
      const res = await this._writeHosts(merged.content);
      if (!res.ok) return { ok: false, error: res.error };
      const after = readManagedBlockInfo(this._readHosts());
      if (!after.present || after.entries !== merged.count) {
        return { ok: false, error: 'hosts-not-written', detail: 'The hosts file did not keep the block (antivirus or another tool may have reverted it).' };
      }
      const st = this._loadState();
      st.hosts = { appliedAt: new Date().toISOString(), sources, count: merged.count, skippedUser: merged.skippedUser, truncated: merged.truncated, backupPath };
      this._saveState();
      return { ok: true, count: merged.count, skippedUser: merged.skippedUser, truncated: merged.truncated, sources, backupPath };
    });
  }

  restoreHosts() {
    return this._exclusive('hosts', async () => {
      const current = this._readHosts();
      const stripped = removeManagedBlock(current);
      if (!stripped.ok) return { ok: false, error: stripped.error };
      const st = this._loadState();
      if (stripped.removed === 0) { delete st.hosts; this._saveState(); return { ok: true, removed: 0 }; }
      this._backupHosts(current);
      const res = await this._writeHosts(stripped.content);
      if (!res.ok) return { ok: false, error: res.error };
      if (readManagedBlockInfo(this._readHosts()).present) return { ok: false, error: 'hosts-not-written' };
      delete st.hosts;
      this._saveState();
      return { ok: true, removed: stripped.removed };
    });
  }

  // ---------------------------------------------------------------- firewall

  async firewallStatus() {
    if (process.platform !== 'win32') return { ok: false, rules: 0, error: 'windows-only' };
    const st = this._loadState();
    try {
      const r = await runPowerShell(buildFirewallStatusScript(), { timeoutMs: 30000, trim: true });
      const data = parseJsonOutput(r.stdout, null);
      return { ok: r.code === 0 && data !== null, rules: Number(data?.rules) || 0, enabled: Number(data?.enabled) || 0, group: FIREWALL_GROUP, addresses: st.firewall?.addresses || 0, sources: st.firewall?.sources || [], appliedAt: st.firewall?.appliedAt || null };
    } catch (e) {
      return { ok: false, rules: 0, error: e?.message || String(e) };
    }
  }

  applyFirewall() {
    return this._exclusive('firewall', async () => {
      if (process.platform !== 'win32') return { ok: false, error: 'windows-only' };
      const { sources, entries } = await this._collect('ip');
      const addresses = sanitizeFirewallAddresses(entries);
      if (!addresses.length) return { ok: false, error: 'no-entries' };
      const res = await ElevationHelper.runMarked(buildFirewallApplyScript(addresses), 600000);
      const snap = parseDhSnapLines(res.out);
      const st = this._loadState();
      const rules = parseFirewallCount(res.out);
      if (!res.ok) return { ok: false, error: res.error };
      st.firewall = { appliedAt: new Date().toISOString(), sources, addresses: addresses.length, rules, previousRules: Number(snap.firewall) || 0 };
      this._saveState();
      return { ok: true, rules, addresses: addresses.length, sources };
    });
  }

  restoreFirewall() {
    return this._exclusive('firewall', async () => {
      if (process.platform !== 'win32') return { ok: false, error: 'windows-only' };
      const res = await ElevationHelper.runMarked(buildFirewallRemoveScript(), 300000);
      if (!res.ok) return { ok: false, error: res.error };
      const left = parseFirewallCount(res.out);
      const st = this._loadState();
      delete st.firewall;
      this._saveState();
      return { ok: left === 0, rules: left, error: left === 0 ? undefined : 'rules-left' };
    });
  }

  // ---------------------------------------------------------------- malware hashes (real-time protection)

  hashesStatus() {
    const st = this._loadState();
    const count = this.securityService?.feedFileHashes?.length || 0;
    return { ok: true, active: count > 0, count, sources: st.hashes?.sources || [], appliedAt: st.hashes?.appliedAt || null };
  }

  applyHashes() {
    return this._exclusive('hashes', async () => {
      const { sources, entries } = await this._collect('hash');
      if (!entries.length) return { ok: false, error: 'no-entries' };
      const count = this.securityService.setFeedFileHashes(entries);
      const st = this._loadState();
      st.hashes = { appliedAt: new Date().toISOString(), sources, count };
      this._saveState();
      return { ok: true, count, sources };
    });
  }

  restoreHashes() {
    return this._exclusive('hashes', async () => {
      this.securityService.setFeedFileHashes([]);
      const st = this._loadState();
      delete st.hashes;
      this._saveState();
      return { ok: true, count: 0 };
    });
  }

  // ---------------------------------------------------------------- hardening

  async _readHardening() {
    if (process.platform !== 'win32') return { raw: null, items: {} };
    const r = await runPowerShell(buildHardeningStatusScript(), { timeoutMs: 45000, trim: true });
    const raw = parseJsonOutput(r.stdout, null);
    return { raw, items: raw ? evaluateHardening(raw) : {} };
  }

  async hardeningStatus() {
    try {
      const { raw, items } = await this._readHardening();
      const st = this._loadState();
      const list = HARDENING_ITEMS.map((it) => ({
        ...it,
        ...(items[it.id] || { available: false, applied: false, detail: null }),
        managed: Boolean(st.hardening[it.id]?.snapshot),
        appliedAt: st.hardening[it.id]?.appliedAt || null,
        options: st.hardening[it.id]?.options || null
      }));
      return {
        ok: raw !== null,
        defender: raw?.defender || null,
        defenderActive: raw ? defenderActive(raw) : false,
        items: list
      };
    } catch (e) {
      return { ok: false, error: e?.message || String(e), items: [] };
    }
  }

  hardeningApply(id, options = {}) {
    return this._exclusive(`hardening:${id}`, async () => {
      const item = getHardeningItem(id);
      if (!item) return { ok: false, error: 'unknown-item' };
      if (process.platform !== 'win32') return { ok: false, error: 'windows-only' };
      const before = await this._readHardening();
      if (item.requiresDefender && !defenderActive(before.raw)) return { ok: false, error: 'defender-inactive' };
      const opts = id === 'asr' ? { mode: options?.mode === 'block' ? 'block' : 'audit' } : {};
      const res = await ElevationHelper.runMarked(buildHardeningApplyScript(id, opts), 300000);
      const st = this._loadState();
      const snapRaw = parseDhSnapLines(res.out)[id];
      // Keep the first snapshot: re-applying must not overwrite the real "before" state with our own values.
      if (!st.hardening[id]?.snapshot && snapRaw !== undefined) {
        const snapshot = parseHardeningSnapshot(id, snapRaw);
        if (snapshot) st.hardening[id] = { snapshot, takenAt: new Date().toISOString() };
      }
      const failed = [...parseDhResults(res.out).values()].filter((r) => !r.ok);
      if (res.ok && !failed.length && st.hardening[id]) {
        st.hardening[id].appliedAt = new Date().toISOString();
        st.hardening[id].options = opts;
      }
      this._saveState();
      if (!res.ok) return { ok: false, error: res.error };
      if (failed.length) return { ok: false, error: failed.map((f) => f.message).join('; ') };
      const after = await this._readHardening();
      const applied = after.items[id]?.applied === true;
      return { ok: applied, applied, error: applied ? undefined : 'not-effective', reboot: item.reboot === true };
    });
  }

  hardeningRestore(id) {
    return this._exclusive(`hardening:${id}`, async () => {
      const item = getHardeningItem(id);
      if (!item) return { ok: false, error: 'unknown-item' };
      const st = this._loadState();
      const snap = st.hardening[id]?.snapshot;
      if (!snap) return { ok: false, error: 'no-snapshot' };
      const res = await ElevationHelper.runMarked(buildHardeningRestoreScript(id, snap), 300000);
      if (!res.ok) return { ok: false, error: res.error };
      const failed = [...parseDhResults(res.out).values()].filter((r) => !r.ok);
      if (failed.length) return { ok: false, error: failed.map((f) => f.message).join('; ') };
      delete st.hardening[id];
      this._saveState();
      return { ok: true, reboot: item.reboot === true };
    });
  }

  // ---------------------------------------------------------------- overview / lookups

  async status() {
    const [firewall, hardening] = await Promise.all([this.firewallStatus(), this.hardeningStatus()]);
    return {
      ok: true,
      busy: this._busy,
      sources: this.listSources(),
      hosts: this.hostsStatus(),
      firewall,
      hashes: this.hashesStatus(),
      hardening
    };
  }

  /** Domain -> source id, from the cached hosts feeds that are enabled (used by the URL scanner). */
  lookupDomain(hostname) {
    if (!this._domainSet) {
      const st = this._loadState();
      const map = new Map();
      for (const s of FEED_SOURCES.filter((x) => x.kind === 'hosts' && st.enabled[x.id])) {
        const list = this._readCache(s.id);
        if (Array.isArray(list)) for (const d of list) if (!map.has(d)) map.set(d, s.id);
      }
      this._domainSet = map;
    }
    let d = normalizeDomain(hostname);
    while (d) {
      const hit = this._domainSet.get(d);
      if (hit) return { domain: d, source: hit };
      const dot = d.indexOf('.');
      if (dot === -1) break;
      d = d.slice(dot + 1);
      if (!d.includes('.')) break;
    }
    return null;
  }

  /** Remote IP -> source id, from the cached IP feeds (enabled ones). */
  lookupIp(ip) {
    if (!this._ipMatcher) {
      const st = this._loadState();
      const entries = [];
      for (const s of FEED_SOURCES.filter((x) => x.kind === 'ip' && st.enabled[x.id])) {
        const list = this._readCache(s.id);
        if (Array.isArray(list)) for (const c of list) entries.push({ text: c, source: s.id });
      }
      this._ipMatcher = buildIpMatcher(entries.map((e) => {
        const [ipPart, pre] = e.text.split('/');
        const n = ipPart.split('.').reduce((a, b) => a * 256 + Number(b), 0);
        const size = 2 ** (32 - (pre ? Number(pre) : 32));
        return { start: n, end: n + size - 1, source: e.source };
      }));
    }
    const hit = this._ipMatcher.match(ip);
    return hit ? { source: hit === true ? null : hit } : null;
  }
}

export default AdvancedProtectionService;
