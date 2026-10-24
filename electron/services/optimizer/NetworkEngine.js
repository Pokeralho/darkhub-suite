import ElevationHelper from './ElevationHelper.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import { runCommand, runPowerShell } from '../PowerShellRunner.js';
import { psQuote } from './OptimizerUtils.js';

const TCPIP_PARAMS = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters';
const PSCHED = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched';
const SET_ID = 'network:advanced';
const EEE_SNAPSHOT = 'network:eee';
const GUID_RE = /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/;

/** Values the previous version wrote in the GLOBAL key (where Windows ignores them). Removed on revert. */
const LEGACY_GLOBAL_VALUES = ['TcpAckFrequency', 'TCPNoDelay', 'MaxConnectionsPerServer', 'DefaultTTL', 'TcpMaxDataRetransmissions'];

/** Pure: registry changes of the advanced network tuning for the given adapters ({name, guid}). */
export function buildAdvancedNetworkChanges(adapters) {
  const changes = [{ key: PSCHED, name: 'NonBestEffortLimit', type: 'REG_DWORD', data: '0' }];
  for (const a of adapters || []) {
    if (!GUID_RE.test(String(a?.guid || ''))) continue;
    const key = `${TCPIP_PARAMS}\\Interfaces\\${a.guid}`;
    changes.push({ key, name: 'TcpAckFrequency', type: 'REG_DWORD', data: '1' });
    changes.push({ key, name: 'TCPNoDelay', type: 'REG_DWORD', data: '1' });
  }
  return changes;
}

class NetworkEngine {
  async getActiveAdapterName() {
    const ps = `
$ErrorActionPreference='Stop'
$a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
if ($null -eq $a) { '' } else { $a.Name }`;
    try {
      const r = await runPowerShell(ps, { timeoutMs: 15000, trim: true });
      return r.code === 0 ? String(r.stdout).trim() : '';
    } catch {
      return '';
    }
  }

  /** Physical adapters that are up: [{ name, guid }] */
  async getUpAdapters() {
    const ps = `
$ErrorActionPreference='Stop'
@(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object { [pscustomobject]@{ name = $_.Name; guid = $_.InterfaceGuid } }) | ConvertTo-Json -Compress`;
    try {
      const r = await runPowerShell(ps, { timeoutMs: 15000, trim: true });
      if (r.code !== 0 || !r.stdout) return [];
      const data = JSON.parse(r.stdout);
      return (Array.isArray(data) ? data : [data]).filter((a) => a?.name && GUID_RE.test(String(a.guid || '')));
    } catch {
      return [];
    }
  }

  async flushDns() {
    const started = Date.now();
    try {
      const r = await runCommand('ipconfig.exe', ['/flushdns'], { timeoutMs: 15000 });
      if (r.code !== 0) {
        const detail = (r.stdout || r.stderr || '').replace(/\s+/g, ' ').trim();
        return this._res('Error', `ipconfig /flushdns falhou (código ${r.code}). ${detail}${/admin|elev/i.test(detail) ? '' : ' Pode ser necessário executar como administrador.'}`, started);
      }
      return this._res('Success', 'Cache do resolvedor de DNS limpo (ipconfig /flushdns concluído). Apenas o cache local foi limpo; a conexão não foi reiniciada.', started);
    } catch (e) {
      return this._res('Error', `Falha: ${e?.message ?? String(e)}`, started);
    }
  }

  _res(status, message, started) {
    return {
      ok: status !== 'Error',
      status,
      durationMs: Date.now() - started,
      affectedResources: ['DNS Cache'],
      processedItems: status === 'Error' ? 0 : 1,
      savings: 0,
      savingsBytes: 0,
      message,
      msg: message,
      ...(status === 'Error' ? { error: message } : {})
    };
  }

  async cleanNetwork() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
$ErrorActionPreference = 'Continue'
& ipconfig.exe /flushdns | Out-Null
& netsh.exe winsock reset
if ($LASTEXITCODE -ne 0) { throw 'netsh winsock reset falhou' }
& netsh.exe int ip reset
`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao redefinir a pilha de rede (UAC cancelado?)' };
    return { ok: true, msg: 'Winsock e pilha TCP/IP redefinidos e cache DNS limpo. É NECESSÁRIO REINICIAR o Windows para concluir.', requiresReboot: true };
  }

  _eeeReadScript(names) {
    return `$ErrorActionPreference='SilentlyContinue'
$names = @(${names.map(psQuote).join(',')})
$out = @()
foreach ($n in $names) {
  # -RegistryKeyword is a wildcard ('*EEE' also matches AdvancedEEE): filter on the exact keyword
  $p = Get-NetAdapterAdvancedProperty -Name $n -AllProperties -ErrorAction SilentlyContinue | Where-Object { $_.RegistryKeyword -eq '*EEE' } | Select-Object -First 1
  if ($p) { $out += [pscustomobject]@{ name = $n; value = [string]$p.RegistryValue } }
}
ConvertTo-Json -InputObject @($out) -Compress`;
  }

  /**
   * Latency-oriented TCP tweaks that Windows actually honors:
   *  - TcpAckFrequency=1 / TCPNoDelay=1 on the INTERFACE key of each active adapter (the old code wrote them to the
   *    global key, where they are ignored)
   *  - Energy-Efficient Ethernet off via the standard *EEE keyword (the old code relied on a localized display name)
   *  - QoS "reservable bandwidth" policy = 0 (placebo on modern Windows, kept as requested and labelled as such)
   * Removed because they could not help or were harmful: MaxConnectionsPerServer (browser setting), DefaultTTL,
   * TcpMaxDataRetransmissions=3 (drops connections earlier on Wi-Fi), forced MTU 1500 (breaks PPPoE/VPN) and RSS=4 queues.
   * All previous values are snapshotted and restored by advancedNetworkRevert().
   */
  async advancedNetworkApply() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const adapters = await this.getUpAdapters();
    if (adapters.length === 0) return { ok: false, error: 'Nenhum adaptador de rede físico ativo encontrado' };

    // snapshot EEE state before touching anything (read needs no elevation)
    let eeeBefore = [];
    try {
      const r = await runPowerShell(this._eeeReadScript(adapters.map((a) => a.name)), { timeoutMs: 20000, trim: true });
      if (r.stdout) {
        const parsed = JSON.parse(r.stdout);
        eeeBefore = Array.isArray(parsed) ? parsed : [parsed];
      }
    } catch { /* adapters without EEE support simply do not appear */ }
    if (!DeepTweaksEngine.getExtra(EEE_SNAPSHOT) || eeeBefore.some((e) => String(e.value) !== '0')) {
      DeepTweaksEngine.saveExtra(EEE_SNAPSHOT, { adapters: eeeBefore });
    }

    const eeeTargets = eeeBefore.filter((e) => String(e.value) !== '0');
    const eeeScript = eeeTargets.length
      ? `$ErrorActionPreference = 'Continue'\r\n${eeeTargets.map((e) => `Get-NetAdapterAdvancedProperty -Name ${psQuote(e.name)} -AllProperties -ErrorAction SilentlyContinue | Where-Object { $_.RegistryKeyword -eq '*EEE' } | Set-NetAdapterAdvancedProperty -RegistryValue 0`).join('\r\n')}`
      : null;

    const res = await DeepTweaksEngine.applyChangeSet({
      id: SET_ID,
      title: 'Rede: ajustes de latência TCP',
      changes: buildAdvancedNetworkChanges(adapters),
      commands: eeeScript ? { apply: eeeScript } : undefined
    });
    if (!res.ok) return { ok: false, error: res.error };
    const eeeNote = eeeTargets.length ? ` Energy-Efficient Ethernet desligado em ${eeeTargets.length} adaptador(es) (a conexão pode piscar por instantes).` : ' Os adaptadores não expõem Energy-Efficient Ethernet.';
    return {
      ok: true,
      msg: `Ajustes de latência aplicados e verificados em ${adapters.map((a) => a.name).join(', ')}.${eeeNote} Efeito pequeno e dependente do jogo/driver; NÃO aumenta a velocidade da internet. Reinicie os jogos/reconecte para valer.`,
      verified: true
    };
  }

  async advancedNetworkRevert() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const adapters = await this.getUpAdapters();
    const fallbackChanges = [
      { key: PSCHED, name: 'NonBestEffortLimit', deleteValue: true },
      ...adapters.flatMap((a) => [
        { key: `${TCPIP_PARAMS}\\Interfaces\\${a.guid}`, name: 'TcpAckFrequency', deleteValue: true },
        { key: `${TCPIP_PARAMS}\\Interfaces\\${a.guid}`, name: 'TCPNoDelay', deleteValue: true }
      ])
    ];
    const res = await DeepTweaksEngine.restoreChangeSet({ id: SET_ID, title: 'Rede: ajustes de latência TCP', fallbackChanges });

    // values written by the previous version of this tweak into the global key
    const legacy = await DeepTweaksEngine.runRegistryOps(LEGACY_GLOBAL_VALUES.map((name) => ({ key: TCPIP_PARAMS, name, deleteValue: true })));
    const legacyFailed = legacy.some((r) => !r?.ok);

    // EEE back to what each adapter had
    const snap = DeepTweaksEngine.getExtra(EEE_SNAPSHOT);
    let eeeNote = '';
    if (snap?.adapters?.length) {
      const lines = ["$ErrorActionPreference = 'Continue'"];
      for (const e of snap.adapters) {
        if (/^\d+$/.test(String(e.value))) lines.push(`Get-NetAdapterAdvancedProperty -Name ${psQuote(e.name)} -AllProperties -ErrorAction SilentlyContinue | Where-Object { $_.RegistryKeyword -eq '*EEE' } | Set-NetAdapterAdvancedProperty -RegistryValue ${Number(e.value)}`);
      }
      const r = await ElevationHelper.runElevatedPowerShell(lines.join('\r\n'));
      if (r.code === 0) { DeepTweaksEngine.clearExtra(EEE_SNAPSHOT); eeeNote = ' Energy-Efficient Ethernet restaurado.'; }
      else eeeNote = ' Não foi possível restaurar o Energy-Efficient Ethernet.';
    }
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, msg: `Ajustes de rede revertidos (${res.msg})${eeeNote}${legacyFailed ? ' Alguns valores legados não puderam ser removidos.' : ''}` };
  }

  /** MMCSS game profile now lives in the verified/snapshotted tweak `tweak:mmcssGames`. */
  async optimizeGameRoute() {
    const res = await DeepTweaksEngine.applyTweaks(['tweak:mmcssGames']);
    return res.ok ? { ok: true, msg: `Perfil multimídia para jogos aplicado e verificado. ${res.msg}` } : { ok: false, error: res.error };
  }

  async revertGameRoute() {
    const res = await DeepTweaksEngine.revertTweaks(['tweak:mmcssGames']);
    return res.ok ? { ok: true, msg: res.msg } : { ok: false, error: res.error };
  }
}

export default new NetworkEngine();
