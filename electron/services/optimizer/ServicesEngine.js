import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import ElevationHelper from './ElevationHelper.js';

const execAsync = promisify(exec);

class ServicesEngine {

  async _getServiceStartMode(serviceName) {
    try {
      const { stdout } = await execAsync(`sc qc ${serviceName}`);
      const match = stdout.match(/START_TYPE\s*:\s*\d+\s+([A-Z_]+)/i);
      return match ? match[1].toUpperCase() : null;
    } catch {
      return null;
    }
  }

  async applyServicesTweak() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      # Busca do Windows (Indexação)
      sc stop WSearch
      sc config WSearch start= disabled
      # Superfetch (SysMain)
      sc stop SysMain
      sc config SysMain start= disabled
      # Telemetria Fixa e Connected User Experiences (CDPSvc)
      sc stop DiagTrack
      sc config DiagTrack start= disabled
      sc stop CDPSvc
      sc config CDPSvc start= disabled
      # Geolocalizacao
      sc stop lfsvc
      sc config lfsvc start= disabled
      # Background Intelligent Transfer (Colocar manual)
      sc stop BITS
      sc config BITS start= demand
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };

    const expectations = [
      { name: 'WSearch', expected: 'DISABLED' },
      { name: 'SysMain', expected: 'DISABLED' },
      { name: 'DiagTrack', expected: 'DISABLED' },
      { name: 'CDPSvc', expected: 'DISABLED' },
      { name: 'lfsvc', expected: 'DISABLED' },
      { name: 'BITS', expected: 'DEMAND_START' }
    ];
    const mismatches = [];
    for (const { name, expected } of expectations) {
      const actual = await this._getServiceStartMode(name);
      if (actual !== expected) mismatches.push({ service: name, expected, actual: actual ?? '(desconhecido)' });
    }

    if (mismatches.length > 0) {
      return {
        ok: true,
        msg: `Busca do Windows, SysMain e Serviços Inúteis foram desligados, mas a verificação pós-aplicação encontrou ${mismatches.length} serviço(s) com estado divergente.`,
        verified: false,
        verifyMismatches: mismatches
      };
    }
    return { ok: true, msg: 'Busca do Windows, SysMain e Serviços Inúteis foram desligados (verificado).', verified: true };
  }

  async revertServicesTweak() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      sc config WSearch start= delayed-auto
      sc start WSearch
      sc config SysMain start= auto
      sc start SysMain
      sc config DiagTrack start= auto
      sc start DiagTrack
      sc config CDPSvc start= auto
      sc config lfsvc start= auto
      sc config BITS start= auto
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Serviços críticos (Busca, SysMain) restaurados.' };
  }
}

export default new ServicesEngine();
