import { exec } from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(exec);

class PowerEngine {
  constructor() {
    this.powerPlans = null;
  }

  async _fetchPowerPlans() {
    try {
      const { stdout } = await execAsync('powercfg /L');
      const lines = stdout.split(/\r?\n/);
      const plans = [];
      for (const line of lines) {
        const match = line.match(/GUID:\s*([a-z0-9-]+)\s+\((.*?)\)/i);
        if (match) {
          plans.push({ guid: match[1], name: match[2].trim(), isActive: line.includes('*') });
        }
      }
      this.powerPlans = plans;
      return plans;
    } catch (e) {
      return [];
    }
  }

  async analyzeHighPerformance() {
    await this._fetchPowerPlans();
    return { ok: true, summary: { command: 'powercfg /setactive [HighPerformance GUID]' } };
  }

  async analyzeBalanced() {
    await this._fetchPowerPlans();
    return { ok: true, summary: { command: 'powercfg /setactive [Balanced GUID]' } };
  }

  async _getActiveSchemeGuid() {
    try {
      const { stdout } = await execAsync('powercfg /getactivescheme');
      const match = stdout.match(/GUID:\s*([a-z0-9-]+)/i);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  async _setPlanByKeywords(keywords, defaultScheme) {
    if (!this.powerPlans) await this._fetchPowerPlans();

    let target = this.powerPlans.find(p => keywords.some(k => p.name.toLowerCase().includes(k)));
    let guidToUse = target ? target.guid : defaultScheme;

    try {
      await execAsync(`powercfg /setactive ${guidToUse}`);

      const activeGuid = await this._getActiveSchemeGuid();
      const verified = activeGuid != null && activeGuid === guidToUse.toLowerCase();

      return {
        status: verified ? 'Success' : 'Warning',
        durationMs: 0,
        affectedResources: ['Powercfg'],
        processedItems: 1,
        savingsBytes: 0,
        message: verified
          ? `Plano alterado para: ${target ? target.name : defaultScheme}`
          : `Comando executado, mas a verificação pós-aplicação não confirmou a troca do plano de energia (esquema ativo: ${activeGuid ?? 'desconhecido'}).`
      };
    } catch (e) {
      return {
        status: 'Error',
        durationMs: 0,
        affectedResources: ['Powercfg'],
        processedItems: 0,
        savingsBytes: 0,
        message: `Falha ao alterar plano de energia: ${e.message}`
      };
    }
  }

  async setHighPerformance() {
    return this._setPlanByKeywords(['ultimate', 'desempenho máximo', 'alto desempenho', 'high performance'], 'SCHEME_MIN');
  }

  async setBalanced() {
    return this._setPlanByKeywords(['equilibrado', 'balanced'], 'SCHEME_BALANCED');
  }
}

export default new PowerEngine();
