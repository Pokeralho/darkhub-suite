import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { runCommand } from '../PowerShellRunner.js';
import { POWER_GUIDS, parsePowercfgList } from './OptimizerUtils.js';

// loaded lazily so the module also works outside Electron (unit tests, tooling)
let electron = null;
try { electron = createRequire(import.meta.url)('electron'); } catch { electron = null; }

const app = electron?.app || null;

class PowerEngine {
  constructor() {
    this.powerPlans = null;
  }

  _statePath() {
    const base = app?.getPath ? app.getPath('userData') : (process.env.APPDATA || process.cwd());
    return path.join(base, 'optimizer_power_previous.json');
  }

  async _powercfg(args) {
    try {
      const r = await runCommand('powercfg.exe', args, { timeoutMs: 15000 });
      return { code: r.code ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
    } catch (e) {
      return { code: 1, stdout: '', stderr: e?.message ?? String(e) };
    }
  }

  async _fetchPowerPlans() {
    const r = await this._powercfg(['/L']);
    this.powerPlans = r.code === 0 ? parsePowercfgList(r.stdout) : [];
    return this.powerPlans;
  }

  async analyzeHighPerformance() {
    await this._fetchPowerPlans();
    return { ok: true, summary: { command: `powercfg /setactive ${POWER_GUIDS.high}` } };
  }

  async analyzeBalanced() {
    await this._fetchPowerPlans();
    return { ok: true, summary: { command: `powercfg /setactive ${POWER_GUIDS.balanced}` } };
  }

  async _getActiveSchemeGuid() {
    const r = await this._powercfg(['/getactivescheme']);
    const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(r.stdout);
    return m ? m[1].toLowerCase() : null;
  }

  /** Plans are matched by GUID (names are localized, and High Performance is hidden on many PCs). */
  async _ensurePlan(guid) {
    const plans = this.powerPlans || await this._fetchPowerPlans();
    if (plans.some((p) => p.guid === guid)) return { ok: true, created: false };
    // The built-in scheme exists in the system even when not listed: duplicate it under the same GUID.
    const dup = await this._powercfg(['/duplicatescheme', guid, guid]);
    const fresh = await this._fetchPowerPlans();
    if (dup.code === 0) return { ok: true, created: true };
    // "A scheme with this GUID already exists" (the cached list was stale, e.g. DarkOS ships Ultimate):
    // the plan is there, so let /setactive + the active-scheme check decide.
    if ((fresh || []).some((p) => p.guid === guid) || /GUID/i.test(`${dup.stderr}${dup.stdout}`)) return { ok: true, created: false };
    return { ok: false, error: dup.stderr || dup.stdout || 'Plano de energia indisponível neste PC' };
  }

  _rememberPrevious(guid) {
    try {
      fs.writeFileSync(this._statePath(), JSON.stringify({ guid, savedAt: Date.now() }), 'utf8');
    } catch { /* best effort */ }
  }

  _readPrevious() {
    try {
      return JSON.parse(fs.readFileSync(this._statePath(), 'utf8'))?.guid || null;
    } catch {
      return null;
    }
  }

  _result(status, message, extra = {}) {
    return {
      ok: status !== 'Error',
      status,
      durationMs: 0,
      affectedResources: ['Powercfg'],
      processedItems: status === 'Error' ? 0 : 1,
      savingsBytes: 0,
      message,
      msg: message,
      ...(status === 'Error' ? { error: message } : {}),
      ...extra
    };
  }

  async _activate(guid, label) {
    const ensured = await this._ensurePlan(guid);
    if (!ensured.ok) return this._result('Error', `Plano "${label}" indisponível: ${ensured.error}`);
    const set = await this._powercfg(['/setactive', guid]);
    if (set.code !== 0) return this._result('Error', `Falha ao ativar o plano "${label}": ${set.stderr || set.stdout}`);
    const active = await this._getActiveSchemeGuid();
    if (active !== guid) {
      return this._result('Error', `O comando foi aceito, mas o plano ativo continua sendo ${active ?? 'desconhecido'} (política de TI ou Modo de Energia do Windows 11 pode estar sobrescrevendo).`);
    }
    return this._result('Success', `Plano de energia ativo (verificado): ${label}.`);
  }

  /**
   * High Performance plan: keeps the CPU at higher clocks. Real on desktops; on laptops it costs battery
   * and heat, and it does not by itself raise FPS. The previously active plan is remembered.
   */
  async setHighPerformance() {
    const before = await this._getActiveSchemeGuid();
    if (before && before !== POWER_GUIDS.high && before !== POWER_GUIDS.ultimate) this._rememberPrevious(before);
    return this._activate(POWER_GUIDS.high, 'Alto Desempenho');
  }

  /** Ultimate Performance (hidden plan, created on demand). Desktop-oriented: no power-saving at all. */
  async setUltimate() {
    const before = await this._getActiveSchemeGuid();
    if (before && before !== POWER_GUIDS.high && before !== POWER_GUIDS.ultimate) this._rememberPrevious(before);
    return this._activate(POWER_GUIDS.ultimate, 'Desempenho Máximo');
  }

  async setBalanced() {
    return this._activate(POWER_GUIDS.balanced, 'Equilibrado');
  }

  /** Back to whatever was active before the app switched to High Performance (or Balanced when unknown). */
  async restorePrevious() {
    const prev = this._readPrevious();
    if (!prev) return this.setBalanced();
    const plans = await this._fetchPowerPlans();
    if (!plans.some((p) => p.guid === prev)) return this.setBalanced();
    const set = await this._powercfg(['/setactive', prev]);
    if (set.code !== 0) return this._result('Error', `Falha ao restaurar o plano anterior: ${set.stderr || set.stdout}`);
    // verified like _activate(): a policy / Windows 11 power mode can silently keep the current plan
    const active = await this._getActiveSchemeGuid();
    if (active !== prev) return this._result('Error', `O comando foi aceito, mas o plano ativo continua sendo ${active ?? 'desconhecido'}.`);
    return this._result('Success', 'Plano de energia anterior restaurado (verificado).');
  }
}

export default new PowerEngine();
