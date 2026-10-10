import ElevationHelper from './ElevationHelper.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import { runPowerShell } from '../PowerShellRunner.js';

/**
 * Services this tweak turns off. BITS was removed: its default is already "Manual" (so the old call changed
 * nothing) and Windows Update depends on it. SysMain is intentionally left alone (helps game loading).
 */
export const MANAGED_SERVICES = [
  { name: 'WSearch', label: 'Windows Search (indexação)', fallback: 'delayed-auto' },
  { name: 'DiagTrack', label: 'Experiências do Usuário Conectado e Telemetria', fallback: 'auto' },
  { name: 'CDPSvc', label: 'Plataforma de Dispositivos Conectados', fallback: 'delayed-auto' },
  { name: 'lfsvc', label: 'Serviço de Geolocalização', fallback: 'demand' }
];

const SNAPSHOT_ID = 'services:redundant';

/** Win32_Service StartMode (+DelayedAutoStart) -> argument for `sc.exe config start=`. */
export function scArgFromStartMode(startMode, delayed) {
  switch (String(startMode || '').toLowerCase()) {
    case 'auto': return delayed ? 'delayed-auto' : 'auto';
    case 'manual': return 'demand';
    case 'disabled': return 'disabled';
    case 'boot': return 'boot';
    case 'system': return 'system';
    default: return null;
  }
}

class ServicesEngine {
  /** Reads the real service configuration (StartMode/State) of the managed services. */
  async readServices(names = MANAGED_SERVICES.map((s) => s.name)) {
    const filter = names.map((n) => `Name='${n.replace(/'/g, '')}'`).join(' OR ');
    const script = `Get-CimInstance Win32_Service -Filter "${filter}" | Select-Object Name, StartMode, DelayedAutoStart, State | ConvertTo-Json -Compress`;
    try {
      const r = await runPowerShell(script, { timeoutMs: 20000, trim: true });
      if (r.code !== 0 || !r.stdout) return null;
      let data = JSON.parse(r.stdout);
      if (!Array.isArray(data)) data = [data];
      const map = {};
      for (const s of data) map[String(s.Name).toLowerCase()] = { name: s.Name, startMode: s.StartMode, delayed: !!s.DelayedAutoStart, state: s.State };
      return map;
    } catch {
      return null;
    }
  }

  async _getServiceStartMode(serviceName) {
    const m = await this.readServices([serviceName]);
    const s = m?.[String(serviceName).toLowerCase()];
    return s ? s.startMode : null;
  }

  async applyServicesTweak() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };

    const before = await this.readServices();
    if (!before) return { ok: false, error: 'Não foi possível ler a configuração atual dos serviços.' };

    const present = MANAGED_SERVICES.filter((s) => before[s.name.toLowerCase()]);
    const alreadyAll = present.every((s) => before[s.name.toLowerCase()].startMode === 'Disabled');
    // keep the ORIGINAL configuration: never overwrite a snapshot while the services are still disabled by us
    if (!DeepTweaksEngine.getExtra(SNAPSHOT_ID) || !present.some((s) => before[s.name.toLowerCase()].startMode === 'Disabled')) {
      DeepTweaksEngine.saveExtra(SNAPSHOT_ID, {
        services: present.map((s) => {
          const b = before[s.name.toLowerCase()];
          return { name: s.name, startArg: scArgFromStartMode(b.startMode, b.delayed), wasRunning: b.state === 'Running' };
        })
      });
    }
    if (alreadyAll) return { ok: true, msg: 'Os serviços já estavam desativados.', verified: true, changed: false };

    const lines = ["$ErrorActionPreference = 'Continue'"];
    for (const s of present) {
      // sc.exe explicitly: in Windows PowerShell "sc" is an alias of Set-Content and would not touch any service.
      lines.push(`& sc.exe config ${s.name} start= disabled | Out-Null`);
      lines.push(`& sc.exe stop ${s.name} | Out-Null`);
    }
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(lines.join('\r\n'));
    if (code !== 0 && code !== 1062 && code !== 1) {
      // sc.exe stop returns 1062 when the service was not running: not an error
      return { ok: false, error: stderr || `Falha ao configurar serviços (código ${code}). UAC cancelado?` };
    }

    const after = await this.readServices();
    if (!after) return { ok: false, error: 'Comando executado, mas não foi possível verificar o resultado.' };
    const mismatches = present
      .map((s) => ({ service: s.name, expected: 'Disabled', actual: after[s.name.toLowerCase()]?.startMode ?? '(desconhecido)' }))
      .filter((m) => m.actual !== m.expected);
    if (mismatches.length === present.length) {
      DeepTweaksEngine.clearExtra(SNAPSHOT_ID);
      return { ok: false, error: 'O Windows não aceitou a alteração dos serviços (UAC cancelado ou política de TI).', verifyMismatches: mismatches };
    }
    if (mismatches.length > 0) {
      return {
        ok: false,
        error: `${present.length - mismatches.length}/${present.length} serviço(s) desativados; falharam: ${mismatches.map((m) => m.service).join(', ')}.`,
        verified: false,
        verifyMismatches: mismatches
      };
    }
    return {
      ok: true,
      msg: `Serviços desativados e verificados: ${present.map((s) => s.name).join(', ')}. Atenção: a Busca do Windows (indexação) deixa de acelerar pesquisas de arquivos e e-mails.`,
      verified: true
    };
  }

  async revertServicesTweak() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const snap = DeepTweaksEngine.getExtra(SNAPSHOT_ID);
    const entries = snap?.services?.length
      ? snap.services
      : MANAGED_SERVICES.map((s) => ({ name: s.name, startArg: s.fallback, wasRunning: s.name !== 'lfsvc' }));
    const lines = ["$ErrorActionPreference = 'Continue'"];
    for (const e of entries) {
      if (!e.startArg || !/^[A-Za-z0-9_.-]+$/.test(e.name) || !/^(auto|delayed-auto|demand|disabled|boot|system)$/.test(e.startArg)) continue;
      lines.push(`& sc.exe config ${e.name} start= ${e.startArg} | Out-Null`);
      if (e.wasRunning && e.startArg !== 'disabled') lines.push(`& sc.exe start ${e.name} | Out-Null`);
    }
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(lines.join('\r\n'));
    if (code !== 0 && code !== 1056 && code !== 1) return { ok: false, error: stderr || `Falha ao restaurar serviços (código ${code})` };

    const after = await this.readServices(entries.map((e) => e.name));
    const bad = (entries || []).filter((e) => {
      const a = after?.[e.name.toLowerCase()];
      return !a || scArgFromStartMode(a.startMode, a.delayed) !== e.startArg;
    });
    if (bad.length) return { ok: false, error: `Não foi possível restaurar: ${bad.map((b) => b.name).join(', ')}` };
    DeepTweaksEngine.clearExtra(SNAPSHOT_ID);
    return { ok: true, msg: snap ? 'Serviços restaurados exatamente como estavam antes (verificado).' : 'Serviços restaurados aos padrões do Windows (sem snapshot anterior).' };
  }
}

export default new ServicesEngine();
