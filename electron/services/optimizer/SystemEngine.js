import fs from 'node:fs';
import path from 'node:path';
import ElevationHelper from './ElevationHelper.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import PowerEngine from './PowerEngine.js';
import StorageEngine from './StorageEngine.js';
import Logger from '../LoggerService.js';
import { runCommand, runPowerShell } from '../PowerShellRunner.js';
import {
  psQuote,
  parseDhSnapLines,
  bcdValueToArg,
  validatePagefileSizes,
  isValidFeatureName,
  isValidCapabilityName,
  isValidExecutionPolicy,
  isValidPciInstanceId,
  wrapMarkedScript,
  parseMarkedOutput
} from './OptimizerUtils.js';

const NOT_WINDOWS = { ok: false, error: 'Only Windows supported' };
const BCD_EXTRA = 'sys:bcd';
const LASTACCESS_EXTRA = 'sys:lastaccess';
const NETWORK_EXTRA = 'sys:networkExtreme';
const CPU_EXTRA = 'sys:cpuUnpark';
const PAGEFILE_EXTRA = 'sys:pagefile';
const CAPS_EXTRA = 'sys:capabilities';
const MSI_SET_ID = 'msi:display';

export { wrapMarkedScript, parseMarkedOutput };

class SystemEngine {
  /** Same protocol as ElevationHelper.runMarked (kept as a method so callers/tests can stub it per engine). */
  _runMarked(script, timeoutMs = 120000) {
    return ElevationHelper.runMarked(script, timeoutMs);
  }

  // ------------------------------------------------------------------ restore point
  /**
   * Creates a real restore point. Windows normally refuses a second one within 24h (and Checkpoint-Computer
   * only prints a warning); the throttle is lifted for this call only and the result is confirmed by the
   * sequence number of the newest restore point.
   */
  async createRestorePoint() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const script = `
$k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore'
$had = $null
$prop = Get-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue
if ($prop) { $had = $prop.SystemRestorePointCreationFrequency }
Enable-ComputerRestore -Drive ($env:SystemDrive + '\\') -ErrorAction SilentlyContinue
$before = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
$seqBefore = 0
if ($before) { $seqBefore = [int]$before.SequenceNumber }
try {
  Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value 0 -Type DWord -Force
  Checkpoint-Computer -Description 'DarkHub Optimizer Checkpoint' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
} finally {
  if ($null -eq $had) { Remove-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
  else { Set-ItemProperty -Path $k -Name SystemRestorePointCreationFrequency -Value $had -Type DWord -Force -ErrorAction SilentlyContinue }
}
$after = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
if (-not $after -or [int]$after.SequenceNumber -le $seqBefore) { throw 'O Windows nao criou o ponto de restauracao (Protecao do Sistema desativada ou bloqueada por politica).' }
Write-Output ('DHRP|' + $after.SequenceNumber)`;
    const r = await this._runMarked(script, 180000);
    if (!r.ok) return { ok: false, error: `Não foi possível criar o ponto de restauração: ${r.error}` };
    const seq = /^DHRP\|(\d+)/m.exec(r.out)?.[1];
    return { ok: true, verified: true, msg: `Ponto de restauração criado e confirmado (nº ${seq ?? '?'}): "DarkHub Optimizer Checkpoint".` };
  }

  // ------------------------------------------------------------------ cleaning
  /**
   * Honest scope: clears the user's "recent" history lists (Run box, typed paths, recent documents), the icon cache
   * file and the temp folders (measured). It does NOT "clean the registry" of orphan keys - that is not safe nor useful.
   */
  async cleanRegistryAndTemp() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$base = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer'
$cleared = 0
$keys = @()
foreach ($sub in 'RunMRU','TypedPaths') { $k = Get-Item -LiteralPath ($base + '\\' + $sub); if ($k) { $keys += $k } }
$rd = Get-Item -LiteralPath ($base + '\\RecentDocs')
if ($rd) { $keys += $rd; $keys += @(Get-ChildItem -LiteralPath $rd.PSPath -Recurse) }
foreach ($k in $keys) {
  foreach ($n in $k.GetValueNames()) {
    if ($n -ne '') { Remove-ItemProperty -LiteralPath $k.PSPath -Name $n -Force; if ($?) { $cleared++ } }
  }
}
Write-Output ('DHMRU|' + $cleared)
$ic = Join-Path $env:LOCALAPPDATA 'IconCache.db'
if (Test-Path -LiteralPath $ic) {
  Remove-Item -LiteralPath $ic -Force
  if (Test-Path -LiteralPath $ic) { Write-Output 'DHICON|locked' } else { Write-Output 'DHICON|removed' }
} else { Write-Output 'DHICON|absent' }`;
    let history = 'não foi possível limpar o histórico';
    let psOk = false;
    try {
      const r = await runPowerShell(script, { timeoutMs: 30000, trim: true });
      const mru = /^DHMRU\|(\d+)/m.exec(r.stdout || '');
      const icon = /^DHICON\|(\w+)/m.exec(r.stdout || '')?.[1];
      if (mru) {
        psOk = true;
        const iconTxt = icon === 'removed' ? 'cache de ícones removido (será recriado)' : icon === 'locked' ? 'cache de ícones em uso (mantido)' : 'sem arquivo de cache de ícones';
        history = `${mru[1]} entrada(s) de histórico (Executar/caminhos digitados/documentos recentes) apagada(s); ${iconTxt}`;
      }
    } catch (e) {
      history = `histórico não limpo: ${e?.message ?? e}`;
    }
    const temp = await StorageEngine.cleanTempFiles();
    const ok = psOk || temp.ok;
    return {
      ok,
      ...(ok ? {} : { error: 'Nada pôde ser limpo.' }),
      freedBytes: temp.freedBytes || 0,
      msg: `${history}. Arquivos temporários: ${temp.msg}`
    };
  }

  /**
   * Opens a visible elevated console running DISM (component store repair) and then SFC. The app cannot observe
   * the end of the repair, so the message says so.
   */
  async repairWindows() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const cmd = '/k echo Reparando arquivos do Windows - DISM e depois SFC. Nao feche esta janela. && DISM /Online /Cleanup-Image /RestoreHealth && sfc /scannow && echo. && echo Reparo concluido. Leia o resultado acima. && pause';
    const script = `
$p = Start-Process -FilePath 'cmd.exe' -ArgumentList ${psQuote(cmd)} -PassThru
if (-not $p) { throw 'nao foi possivel abrir o console de reparo' }
Write-Output ('DHPID|' + $p.Id)`;
    const r = await this._runMarked(script, 60000);
    if (!r.ok) return { ok: false, error: `Reparo não iniciado: ${r.error}` };
    return { ok: true, started: true, msg: 'Janela de reparo (DISM + SFC) aberta como administrador. Pode levar de 10 a 30 minutos; o resultado aparece nessa janela (o app não acompanha o término).' };
  }

  /**
   * The previous implementation downloaded and ran a third-party activation script from the internet with admin rights.
   * That is not an "optimization", it is remote code execution (and a licensing violation). It now just opens the
   * official Windows activation page.
   */
  // DarkOS: no remote scripts and no activation bypass. Opens the official Windows activation settings page
  // (ms-settings:activation), where the user can enter a genuine product key or sign in with a digital license.
  async activateWindows() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    try {
      await runPowerShell(`Start-Process 'ms-settings:activation'`);
      return { ok: true, msg: 'Página oficial de Ativação do Windows aberta (Configurações > Sistema > Ativação). Use uma chave de produto genuína ou sua licença digital.' };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }

  // ------------------------------------------------------------------ power
  async setPerformanceMode(mode) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    return mode === 'ultimate' ? PowerEngine.setUltimate() : PowerEngine.setHighPerformance();
  }

  // ------------------------------------------------------------------ boot configuration + NTFS (shared, snapshot based)
  _lowLevelReadBlock({ timer, lastAccess }) {
    const lines = [];
    if (timer) {
      lines.push(`$bcdTxt = (& bcdedit.exe /enum '{current}') | Out-String
DhCheck 'bcdedit /enum'
foreach ($n in 'disabledynamictick','useplatformtick','useplatformclock') {
  $m = [regex]::Match($bcdTxt, '(?im)^\\s*' + $n + '\\s+(\\S+)')
  if ($m.Success) { Write-Output ('@TAG@|' + $n + '|' + $m.Groups[1].Value) } else { Write-Output ('@TAG@|' + $n + '|-') }
}`);
    }
    if (lastAccess) {
      lines.push(`$laTxt = (& fsutil.exe behavior query disablelastaccess) | Out-String
$laM = [regex]::Match($laTxt, '=\\s*(\\d+)')
if ($laM.Success) { Write-Output ('@TAG@|lastaccess|' + $laM.Groups[1].Value) } else { Write-Output '@TAG@|lastaccess|-' }`);
    }
    return lines.join('\r\n');
  }

  async _applyLowLevel({ timer = false, lastAccess = false }) {
    const parts = [this._lowLevelReadBlock({ timer, lastAccess }).replace(/@TAG@/g, 'DHSNAP')];
    if (timer) parts.push("& bcdedit.exe /set disabledynamictick yes | Out-Null\r\nDhCheck 'bcdedit /set disabledynamictick'");
    if (lastAccess) parts.push("& fsutil.exe behavior set disablelastaccess 1 | Out-Null\r\nDhCheck 'fsutil behavior set disablelastaccess'");
    parts.push(this._lowLevelReadBlock({ timer, lastAccess }).replace(/@TAG@/g, 'DHAFT'));
    const r = await this._runMarked(parts.join('\r\n'), 90000);
    const before = parseDhSnapLines(r.out, 'DHSNAP');
    const after = parseDhSnapLines(r.out, 'DHAFT');

    // keep the ORIGINAL values: never overwrite a snapshot while our change is still in place
    if (timer && before.disabledynamictick !== undefined && (!DeepTweaksEngine.getExtra(BCD_EXTRA) || bcdValueToArg(before.disabledynamictick) !== 'yes')) {
      DeepTweaksEngine.saveExtra(BCD_EXTRA, { disabledynamictick: before.disabledynamictick, useplatformtick: before.useplatformtick, useplatformclock: before.useplatformclock });
    }
    if (lastAccess && before.lastaccess !== undefined && (!DeepTweaksEngine.getExtra(LASTACCESS_EXTRA) || before.lastaccess !== '1')) {
      const n = Number.parseInt(before.lastaccess, 10);
      if (Number.isInteger(n)) DeepTweaksEngine.saveExtra(LASTACCESS_EXTRA, { value: n });
    }

    const problems = [];
    if (!r.ok) problems.push(r.error);
    if (r.ok && timer && bcdValueToArg(after.disabledynamictick) !== 'yes') problems.push('bcdedit não confirmou disabledynamictick=Yes (Secure Boot/política pode bloquear)');
    if (r.ok && lastAccess && after.lastaccess !== '1') problems.push('fsutil não confirmou disablelastaccess=1');
    return { ok: problems.length === 0, error: problems.join('; '), before, after };
  }

  async _revertLowLevel({ timer = false, lastAccess = false }) {
    const lines = [];
    const snapBcd = timer ? DeepTweaksEngine.getExtra(BCD_EXTRA) : null;
    const snapLa = lastAccess ? DeepTweaksEngine.getExtra(LASTACCESS_EXTRA) : null;
    if (timer) {
      for (const name of ['disabledynamictick', 'useplatformtick', 'useplatformclock']) {
        if (!snapBcd && name !== 'disabledynamictick') continue; // never touch values we did not change
        const arg = snapBcd ? bcdValueToArg(snapBcd[name]) : null;
        lines.push(arg
          ? `& bcdedit.exe /set ${name} ${arg} | Out-Null\r\nDhCheck 'bcdedit /set ${name}'`
          : `& bcdedit.exe /deletevalue ${name} | Out-Null`); // "element not found" is fine here
      }
    }
    if (lastAccess) {
      const v = Number.isInteger(snapLa?.value) && snapLa.value >= 0 && snapLa.value <= 3 ? snapLa.value : 2;
      lines.push(`& fsutil.exe behavior set disablelastaccess ${v} | Out-Null\r\nDhCheck 'fsutil behavior set disablelastaccess'`);
    }
    lines.push(this._lowLevelReadBlock({ timer, lastAccess }).replace(/@TAG@/g, 'DHAFT'));
    const r = await this._runMarked(lines.join('\r\n'), 90000);
    if (!r.ok) return { ok: false, error: r.error };
    const after = parseDhSnapLines(r.out, 'DHAFT');
    const bad = [];
    if (timer) {
      const want = snapBcd ? bcdValueToArg(snapBcd.disabledynamictick) : null;
      const got = bcdValueToArg(after.disabledynamictick);
      if (want !== got) bad.push('disabledynamictick');
    }
    if (lastAccess) {
      const want = Number.isInteger(snapLa?.value) && snapLa.value >= 0 && snapLa.value <= 3 ? snapLa.value : 2;
      if (after.lastaccess !== undefined && after.lastaccess !== '-' && Number.parseInt(after.lastaccess, 10) !== want) bad.push('disablelastaccess');
    }
    if (bad.length) return { ok: false, error: `Não foi possível restaurar: ${bad.join(', ')}` };
    if (timer) DeepTweaksEngine.clearExtra(BCD_EXTRA);
    if (lastAccess) DeepTweaksEngine.clearExtra(LASTACCESS_EXTRA);
    return { ok: true };
  }

  /**
   * Timer tuning: bcdedit /set disabledynamictick yes. Needs a reboot, and the benefit (steadier timer ticks)
   * is small and hardware dependent; it can raise idle power use. The previous value is snapshotted.
   */
  async applyTimerTuning() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const r = await this._applyLowLevel({ timer: true });
    if (!r.ok) return { ok: false, error: `Falha ao ajustar o timer: ${r.error}` };
    return { ok: true, verified: true, requiresReboot: true, msg: 'disabledynamictick=Yes gravado e verificado no BCD. REINICIE o Windows para valer. Ganho pequeno e dependente do hardware; pode aumentar o consumo em repouso. Isto NÃO altera a resolução do timer por si só.' };
  }

  async revertTimerTuning() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const r = await this._revertLowLevel({ timer: true });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, requiresReboot: true, msg: 'Configuração de timer do BCD restaurada. Reinicie o Windows.' };
  }

  // ------------------------------------------------------------------ hardcore (VBS off) / kernel
  async applyHardcoreGamerMode() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const reg = await DeepTweaksEngine.applyTweaks(['tweak:disableVBS', 'tweak:disableHibernation']);
    const low = await this._applyLowLevel({ lastAccess: true });
    const problems = [];
    if (!reg.ok) problems.push(reg.error);
    if (!low.ok) problems.push(low.error);
    if (problems.length) return { ok: false, error: problems.join(' | '), requiresReboot: true };
    return {
      ok: true,
      verified: true,
      requiresReboot: true,
      msg: 'Modo Hardcore aplicado e verificado: VBS/Integridade de Memória desligados, hibernação desativada e atualização de "último acesso" do NTFS desligada. ALERTA: a proteção contra malware de kernel foi reduzida. REINICIE o Windows. Use "Reverter" para voltar exatamente ao estado anterior.'
    };
  }

  async revertHardcoreGamerMode() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const reg = await DeepTweaksEngine.revertTweaks(['tweak:disableVBS', 'tweak:disableHibernation']);
    const low = await this._revertLowLevel({ lastAccess: true });
    const problems = [];
    if (!reg.ok) problems.push(reg.error);
    if (!low.ok) problems.push(low.error);
    if (problems.length) return { ok: false, error: problems.join(' | ') };
    return { ok: true, requiresReboot: true, msg: 'Modo Hardcore revertido aos valores salvos antes da aplicação. Reinicie o computador.' };
  }

  /**
   * Kernel/latency mod. What is real here: Win32PrioritySeparation=0x26 (foreground boost), DisablePagingExecutive,
   * the MMCSS "Games" profile, NTFS last-access updates off and dynamic tick off. Dropped because they were wrong
   * or harmful: fsutil memoryusage 2 (default is 1; 0 is invalid), 8.3 names off (breaks legacy installers) and
   * LargeSystemCache (already 0 on clients). HAGS is no longer touched/deleted here.
   */
  async applyExtremeKernelMod() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const reg = await DeepTweaksEngine.applyTweaks(['group:kernelCore', 'tweak:mmcssGames']);
    const low = await this._applyLowLevel({ timer: true, lastAccess: true });
    const problems = [];
    if (!reg.ok) problems.push(reg.error);
    if (!low.ok) problems.push(low.error);
    if (problems.length) return { ok: false, error: problems.join(' | '), requiresReboot: true };
    return {
      ok: true,
      verified: true,
      requiresReboot: true,
      msg: 'Aplicado e verificado: prioridade de primeiro plano (0x26), DisablePagingExecutive, perfil MMCSS de jogos, último acesso do NTFS desligado e dynamic tick desligado. REINICIE o Windows. Ganhos reais porém pequenos; DisablePagingExecutive mantém código do kernel na RAM (use só com 16 GB ou mais).'
    };
  }

  async revertExtremeKernelMod() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const reg = await DeepTweaksEngine.revertTweaks(['group:kernelCore', 'tweak:mmcssGames']);
    const low = await this._revertLowLevel({ timer: true, lastAccess: true });
    const problems = [];
    if (!reg.ok) problems.push(reg.error);
    if (!low.ok) problems.push(low.error);
    if (problems.length) return { ok: false, error: problems.join(' | ') };
    return { ok: true, requiresReboot: true, msg: 'Kernel, agendador multimídia, NTFS e timer restaurados aos valores anteriores (snapshot). Reinicie o Windows.' };
  }

  // ------------------------------------------------------------------ network (extreme)
  /**
   * What is real: Receive Segment Coalescing off (lower per-packet latency, more CPU), RSS on and the "InternetCustom"
   * TCP template (the one Windows uses by default) with timestamps off / normal autotuning. Removed: InitialRto=2000
   * (higher than the 1000 ms default: slower retransmits), DefaultTTL, EnableTCPA/EnableRSS (obsolete values).
   */
  async applyExtremeNetworkMod() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const readBlock = (tag) => `$o = Get-NetOffloadGlobalSetting -ErrorAction Stop
$t = Get-NetTCPSetting -SettingName InternetCustom -ErrorAction Stop
Write-Output ('${tag}|rsc|' + $o.ReceiveSegmentCoalescing)
Write-Output ('${tag}|rss|' + $o.ReceiveSideScaling)
Write-Output ('${tag}|timestamps|' + $t.Timestamps)
Write-Output ('${tag}|autotuning|' + $t.AutoTuningLevelLocal)`;
    const script = `${readBlock('DHSNAP')}
Set-NetOffloadGlobalSetting -ReceiveSegmentCoalescing Disabled -ReceiveSideScaling Enabled -ErrorAction Stop
Set-NetTCPSetting -SettingName InternetCustom -Timestamps Disabled -AutoTuningLevelLocal Normal -ErrorAction Stop
${readBlock('DHAFT')}`;
    const r = await this._runMarked(script, 90000);
    const before = parseDhSnapLines(r.out, 'DHSNAP');
    const after = parseDhSnapLines(r.out, 'DHAFT');
    if (before.rsc && (!DeepTweaksEngine.getExtra(NETWORK_EXTRA) || /^enabled$/i.test(before.rsc))) {
      DeepTweaksEngine.saveExtra(NETWORK_EXTRA, before);
    }
    if (!r.ok) return { ok: false, error: `Falha ao ajustar a pilha TCP: ${r.error}` };
    const bad = [];
    if (!/^disabled$/i.test(after.rsc || '')) bad.push('RSC');
    if (!/^enabled$/i.test(after.rss || '')) bad.push('RSS');
    if (!/^disabled$/i.test(after.timestamps || '')) bad.push('Timestamps');
    if (!/^normal$/i.test(after.autotuning || '')) bad.push('AutoTuning');
    if (bad.length) return { ok: false, error: `O Windows não confirmou: ${bad.join(', ')}` };
    return { ok: true, verified: true, msg: 'Pilha TCP ajustada e verificada: RSC desligado (menos latência por pacote, um pouco mais de CPU), RSS ligado, timestamps desligados, autotuning normal. NÃO aumenta a velocidade da internet; o efeito em ping é pequeno.' };
  }

  async revertExtremeNetworkMod() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const snap = DeepTweaksEngine.getExtra(NETWORK_EXTRA);
    const word = /^[A-Za-z]{3,30}$/;
    const v = (k, d) => (word.test(String(snap?.[k] || '')) ? snap[k] : d);
    const script = `Set-NetOffloadGlobalSetting -ReceiveSegmentCoalescing ${v('rsc', 'Enabled')} -ReceiveSideScaling ${v('rss', 'Enabled')} -ErrorAction Stop
Set-NetTCPSetting -SettingName InternetCustom -Timestamps ${v('timestamps', 'Disabled')} -AutoTuningLevelLocal ${v('autotuning', 'Normal')} -ErrorAction Stop
$o = Get-NetOffloadGlobalSetting
Write-Output ('DHAFT|rsc|' + $o.ReceiveSegmentCoalescing)`;
    const r = await this._runMarked(script, 60000);
    if (!r.ok) return { ok: false, error: `Falha ao restaurar a pilha TCP: ${r.error}` };
    const after = parseDhSnapLines(r.out, 'DHAFT');
    if (after.rsc && after.rsc.toLowerCase() !== v('rsc', 'Enabled').toLowerCase()) return { ok: false, error: 'O Windows não confirmou a restauração do RSC.' };
    DeepTweaksEngine.clearExtra(NETWORK_EXTRA);
    return { ok: true, msg: snap ? 'Pilha TCP restaurada exatamente como estava.' : 'Pilha TCP restaurada aos padrões do Windows (sem snapshot anterior).' };
  }

  // ------------------------------------------------------------------ CPU core parking
  async applyCpuUnpark() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const readFn = `function DhAc([string]$scheme, [string]$alias) {
  $t = (& powercfg.exe /query $scheme SUB_PROCESSOR $alias) | Out-String
  $m = [regex]::Matches($t, '0x[0-9a-fA-F]{8}')
  if ($m.Count -ge 2) { return [Convert]::ToInt32($m[$m.Count-2].Value.Substring(2), 16) }
  # Core parking settings are hidden by default and /query prints nothing for them: read the stored AC index.
  $ids = @{ CPMINCORES = '0cc5b647-c1df-4637-891a-dec35c318583'; CPMAXCORES = 'ea062031-0e34-4ff1-9b6d-eb1059334028'; PROCFREQMAX = '75b0ae3f-bce0-45a7-8c89-c9611c25e100' }
  if ($ids.ContainsKey($alias)) {
    $k = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes\\$scheme\\54533251-82be-4824-96c1-47b60b740d00\\$($ids[$alias])"
    $v = (Get-ItemProperty -LiteralPath $k -Name ACSettingIndex -ErrorAction SilentlyContinue).ACSettingIndex
    if ($null -ne $v) { return [int]$v }
  }
  return '-'
}
$act = (& powercfg.exe /getactivescheme) | Out-String
$g = [regex]::Match($act, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}')
if (-not $g.Success) { throw 'nao foi possivel identificar o plano de energia ativo' }
$scheme = $g.Value`;
    const script = `${readFn}
Write-Output ('DHSNAP|scheme|' + $scheme)
foreach ($a in 'CPMINCORES','CPMAXCORES','PROCFREQMAX') { Write-Output ('DHSNAP|' + $a + '|' + (DhAc $scheme $a)) }
& powercfg.exe /setacvalueindex $scheme SUB_PROCESSOR CPMINCORES 100 | Out-Null
DhCheck 'powercfg CPMINCORES'
& powercfg.exe /setacvalueindex $scheme SUB_PROCESSOR CPMAXCORES 100 | Out-Null
& powercfg.exe /setactive $scheme | Out-Null
DhCheck 'powercfg /setactive'
foreach ($a in 'CPMINCORES','CPMAXCORES') { Write-Output ('DHAFT|' + $a + '|' + (DhAc $scheme $a)) }`;
    const r = await this._runMarked(script, 60000);
    const before = parseDhSnapLines(r.out, 'DHSNAP');
    const after = parseDhSnapLines(r.out, 'DHAFT');
    if (before.scheme && (!DeepTweaksEngine.getExtra(CPU_EXTRA) || before.CPMINCORES !== '100')) DeepTweaksEngine.saveExtra(CPU_EXTRA, before);
    if (!r.ok) return { ok: false, error: `Falha ao ajustar o estacionamento de núcleos: ${r.error}` };
    if (after.CPMINCORES !== '100') return { ok: false, error: 'O Windows não confirmou o valor (CPMINCORES) no plano ativo.' };
    return { ok: true, verified: true, msg: 'Núcleos mantidos ativos (mínimo 100%) no plano de energia ativo, quando ligado na tomada. Só vale para o plano atual; aumenta consumo e calor. Em CPUs híbridas/Windows 11 o ganho costuma ser mínimo.' };
  }

  async revertCpuUnpark() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const snap = DeepTweaksEngine.getExtra(CPU_EXTRA);
    if (!snap?.scheme || !/^[0-9a-fA-F-]{36}$/.test(snap.scheme)) {
      return { ok: false, error: 'Não há valores salvos para restaurar o estacionamento de núcleos. Use "Equilibrado" no plano de energia para voltar ao padrão.' };
    }
    const lines = [];
    for (const a of ['CPMINCORES', 'CPMAXCORES']) {
      const val = Number.parseInt(snap[a], 10);
      if (Number.isInteger(val) && val >= 0 && val <= 100) lines.push(`& powercfg.exe /setacvalueindex ${snap.scheme} SUB_PROCESSOR ${a} ${val} | Out-Null\r\nDhCheck 'powercfg ${a}'`);
    }
    if (!lines.length) return { ok: false, error: 'Snapshot sem valores utilizáveis.' };
    lines.push(`& powercfg.exe /setactive ${snap.scheme} | Out-Null\r\nDhCheck 'powercfg /setactive'`);
    const r = await this._runMarked(lines.join('\r\n'), 60000);
    if (!r.ok) return { ok: false, error: `Falha ao restaurar: ${r.error}` };
    DeepTweaksEngine.clearExtra(CPU_EXTRA);
    return { ok: true, msg: 'Estacionamento de núcleos restaurado aos valores anteriores do plano.' };
  }

  // ------------------------------------------------------------------ MSI mode (GPU only)
  async _displayPciIds() {
    try {
      const r = await runPowerShell("Get-PnpDevice -Class Display -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -like 'PCI\\*' } | ForEach-Object { $_.InstanceId }", { timeoutMs: 20000, trim: true });
      if (r.code !== 0) return [];
      return String(r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(isValidPciInstanceId);
    } catch {
      return [];
    }
  }

  _msiKey(id) {
    return `HKLM\\SYSTEM\\CurrentControlSet\\Enum\\${id}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`;
  }

  /**
   * MSI (message signaled interrupts) for GRAPHICS adapters only. The previous version forced MessageNumberLimit=2048
   * and a priority policy on every PCI device (storage/USB/network controllers included), which can make a PC unbootable.
   */
  async applyMsiMode() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const ids = await this._displayPciIds();
    if (!ids.length) return { ok: false, error: 'Nenhuma placa de vídeo PCI encontrada (GPUs virtuais/básicas são ignoradas).' };
    const res = await DeepTweaksEngine.applyChangeSet({
      id: MSI_SET_ID,
      title: 'Modo MSI para a GPU',
      changes: ids.map((id) => ({ key: this._msiKey(id), name: 'MSISupported', type: 'REG_DWORD', data: '1' })),
      requiresReboot: true
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, verified: true, requiresReboot: true, msg: `MSISupported=1 gravado e verificado em ${ids.length} placa(s) de vídeo. REINICIE o Windows. Muitas GPUs modernas já usam MSI; o ganho é pequeno e só em latência de interrupção. Se houver instabilidade, use "Reverter".` };
  }

  async revertMsiMode() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const ids = await this._displayPciIds();
    const res = await DeepTweaksEngine.restoreChangeSet({
      id: MSI_SET_ID,
      title: 'Modo MSI para a GPU',
      fallbackChanges: ids.map((id) => ({ key: this._msiKey(id), name: 'MSISupported', deleteValue: true })),
      requiresReboot: true
    });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, requiresReboot: true, msg: 'Modo MSI da GPU restaurado ao valor anterior. Reinicie o Windows.' };
  }

  // ------------------------------------------------------------------ pagefile / hibernation / policies / features
  /** setPagefile('auto') = let Windows manage it. Otherwise custom sizes in MB on the system drive. */
  async setPagefile(initialMb, maxMb) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const auto = String(initialMb).toLowerCase() === 'auto' || Number(initialMb) === 0;
    let sizes = null;
    if (!auto) {
      sizes = validatePagefileSizes(initialMb, maxMb);
      if (!sizes.ok) return { ok: false, error: sizes.error };
    }
    const snapshotBlock = `$cs = Get-CimInstance Win32_ComputerSystem
Write-Output ('DHSNAP|auto|' + $cs.AutomaticManagedPagefile)
$pfs = @(Get-CimInstance Win32_PageFileSetting -ErrorAction SilentlyContinue)
Write-Output ('DHSNAP|pf|' + (($pfs | ForEach-Object { $_.Name + ',' + $_.InitialSize + ',' + $_.MaximumSize }) -join ';'))`;
    const applyBlock = auto
      ? `Set-CimInstance -InputObject $cs -Property @{ AutomaticManagedPagefile = $true }
$cs2 = Get-CimInstance Win32_ComputerSystem
if (-not $cs2.AutomaticManagedPagefile) { throw 'o Windows nao confirmou o gerenciamento automatico' }`
      : `Set-CimInstance -InputObject $cs -Property @{ AutomaticManagedPagefile = $false }
$name = ($env:SystemDrive + '\\pagefile.sys')
$pf = Get-CimInstance Win32_PageFileSetting | Where-Object { $_.Name -ieq $name }
if ($pf) { Set-CimInstance -InputObject $pf -Property @{ InitialSize = [uint32]${sizes.init}; MaximumSize = [uint32]${sizes.max} } }
else { New-CimInstance -ClassName Win32_PageFileSetting -Property @{ Name = $name; InitialSize = [uint32]${sizes.init}; MaximumSize = [uint32]${sizes.max} } | Out-Null }
$v = Get-CimInstance Win32_PageFileSetting | Where-Object { $_.Name -ieq $name }
if (-not $v -or [int]$v.InitialSize -ne ${sizes.init} -or [int]$v.MaximumSize -ne ${sizes.max}) { throw 'o Windows nao confirmou os tamanhos do arquivo de paginacao' }`;
    const r = await this._runMarked(`${snapshotBlock}\r\n${applyBlock}`, 90000);
    const before = parseDhSnapLines(r.out, 'DHSNAP');
    if (before.auto !== undefined && !DeepTweaksEngine.getExtra(PAGEFILE_EXTRA)) DeepTweaksEngine.saveExtra(PAGEFILE_EXTRA, before);
    if (!r.ok) return { ok: false, error: `Falha ao configurar o arquivo de paginação: ${r.error}` };
    return {
      ok: true,
      verified: true,
      requiresReboot: true,
      msg: auto
        ? 'Arquivo de paginação voltou a ser gerenciado automaticamente pelo Windows. Reinicie para concluir.'
        : `Arquivo de paginação fixo em ${sizes.init} MB (inicial) / ${sizes.max} MB (máximo) no drive do sistema, verificado. Reinicie para valer. Valores pequenos demais podem causar falta de memória virtual.`
    };
  }

  async revertPagefile() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    // The snapshot is cleared only after the restore succeeded: clearing it first lost the original sizes on any
    // failure (UAC cancelled...) and let setPagefile() snapshot the CURRENT custom sizes as if they were the original.
    const snap = DeepTweaksEngine.getExtra(PAGEFILE_EXTRA);
    const first = String(snap?.pf || '').split(';').filter(Boolean)[0];
    const m = /^(.+),(\d+),(\d+)$/.exec(first || '');
    const res = !snap || /^true$/i.test(String(snap.auto)) || !m
      ? await this.setPagefile('auto')
      : await this.setPagefile(Number(m[2]), Number(m[3]));
    if (res.ok) DeepTweaksEngine.clearExtra(PAGEFILE_EXTRA);
    return res;
  }

  async toggleHibernation(enable) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const state = enable ? 'on' : 'off';
    const script = `& powercfg.exe /hibernate ${state} | Out-Null
DhCheck 'powercfg /hibernate ${state}'
$h = (Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power' -Name HibernateEnabled).HibernateEnabled
Write-Output ('DHSTATE|' + $h)`;
    const r = await this._runMarked(script, 60000);
    if (!r.ok) return { ok: false, error: `Falha ao ${enable ? 'ativar' : 'desativar'} a hibernação: ${r.error}` };
    const now = /^DHSTATE\|(\d+)/m.exec(r.out)?.[1];
    if (now !== undefined && (now === '1') !== Boolean(enable)) return { ok: false, error: 'O Windows não confirmou a nova configuração de hibernação.' };
    return { ok: true, verified: true, msg: `Hibernação ${enable ? 'ativada' : 'desativada'} e verificada.${enable ? '' : ' hiberfil.sys removido; a Inicialização Rápida também deixa de funcionar.'}` };
  }

  async setExecutionPolicy(policy) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    if (!isValidExecutionPolicy(policy)) return { ok: false, error: `Política inválida: ${String(policy).slice(0, 40)}` };
    const script = `Set-ExecutionPolicy -ExecutionPolicy ${policy} -Scope LocalMachine -Force
Set-ExecutionPolicy -ExecutionPolicy ${policy} -Scope CurrentUser -Force
Write-Output ('DHSTATE|' + (Get-ExecutionPolicy -Scope LocalMachine))`;
    const r = await this._runMarked(script, 60000);
    if (!r.ok) return { ok: false, error: `Falha ao alterar a política de execução: ${r.error}` };
    const now = /^DHSTATE\|(\w+)/m.exec(r.out)?.[1];
    if (now && now.toLowerCase() !== policy.toLowerCase()) return { ok: false, error: `O Windows manteve a política "${now}" (provavelmente definida por Diretiva de Grupo).` };
    const warn = policy === 'Bypass' || policy === 'Unrestricted' ? ' ATENÇÃO: esta política permite executar qualquer script sem verificação.' : '';
    return { ok: true, verified: true, msg: `Política de execução do PowerShell definida como ${policy} (verificada).${warn}` };
  }

  async toggleFeature(feature, enable = true) {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const featureMap = {
      wsl: 'Microsoft-Windows-Subsystem-Linux',
      hyperv: 'Microsoft-Hyper-V-All',
      sandbox: 'Containers-DisposableClientVM',
      vmplatform: 'VirtualMachinePlatform'
    };
    const featureName = featureMap[feature] || String(feature || '');
    if (!isValidFeatureName(featureName)) return { ok: false, error: 'Nome de recurso do Windows inválido.' };
    const q = psQuote(featureName);
    const action = enable
      ? `if ($f.State -ne 'Enabled') { $r = Enable-WindowsOptionalFeature -Online -FeatureName ${q} -All -NoRestart -ErrorAction Stop; if ($r.RestartNeeded) { Write-Output 'DHREBOOT|1' } }`
      : `if ($f.State -ne 'Disabled') { $r = Disable-WindowsOptionalFeature -Online -FeatureName ${q} -NoRestart -ErrorAction Stop; if ($r.RestartNeeded) { Write-Output 'DHREBOOT|1' } }`;
    const script = `$f = Get-WindowsOptionalFeature -Online -FeatureName ${q} -ErrorAction Stop
${action}
Write-Output ('DHSTATE|' + (Get-WindowsOptionalFeature -Online -FeatureName ${q}).State)`;
    const r = await this._runMarked(script, 300000);
    if (!r.ok) return { ok: false, error: `Falha ao ${enable ? 'habilitar' : 'desabilitar'} ${featureName}: ${r.error}` };
    const st = /^DHSTATE\|(\w+)/m.exec(r.out)?.[1] || '';
    const good = enable ? /^(Enabled|EnablePending)$/i.test(st) : /^(Disabled|DisablePending)$/i.test(st);
    if (!good) return { ok: false, error: `O recurso ${featureName} ficou em "${st || 'desconhecido'}".` };
    const reboot = /^DHREBOOT\|1/m.test(r.out) || /Pending/i.test(st);
    return { ok: true, verified: true, requiresReboot: reboot, msg: `Recurso ${featureName} ${enable ? 'habilitado' : 'desabilitado'} (estado: ${st}).${reboot ? ' Reinicie o Windows para concluir.' : ''}` };
  }

  /** Removes optional Windows capabilities (+ Recall when present). Names that are not installed are reported, not faked. */
  async removeCapabilitiesAndRecall() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const script = `$names = @('OneCoreUAP.OneSync','App.Support.QuickAssist','Hello.Face.18967','Hello.Face.Migration.18967','Hello.Face.20134','Microsoft.Windows.WordPad')
$caps = @(Get-WindowsCapability -Online -ErrorAction Stop)
foreach ($c in $caps) {
  $base = ($c.Name -split '~')[0]
  if (($names -contains $base) -and $c.State -eq 'Installed') {
    try { Remove-WindowsCapability -Online -Name $c.Name -ErrorAction Stop | Out-Null; Write-Output ('DHREM|' + $c.Name) }
    catch { Write-Output ('DHERR|' + $c.Name) }
  }
}
$rec = Get-WindowsOptionalFeature -Online -FeatureName Recall -ErrorAction SilentlyContinue
if ($rec -and $rec.State -eq 'Enabled') {
  try { Disable-WindowsOptionalFeature -Online -FeatureName Recall -Remove -NoRestart -ErrorAction Stop | Out-Null; Write-Output 'DHRECALL|removed' } catch { Write-Output 'DHRECALL|error' }
} elseif ($rec) { Write-Output 'DHRECALL|already' } else { Write-Output 'DHRECALL|absent' }`;
    const r = await this._runMarked(script, 600000);
    if (!r.ok) return { ok: false, error: `Falha ao remover componentes: ${r.error}` };
    const removed = [...r.out.matchAll(/^DHREM\|(.+)$/gm)].map((m) => m[1].trim());
    const errors = [...r.out.matchAll(/^DHERR\|(.+)$/gm)].map((m) => m[1].trim());
    const recall = /^DHRECALL\|(\w+)/m.exec(r.out)?.[1] || 'absent';
    if (removed.length || recall === 'removed') {
      const prevSnap = DeepTweaksEngine.getExtra(CAPS_EXTRA) || {};
      // Recall is recorded too, otherwise "Reverter" (advertised as restoring what was removed) never brought it back
      DeepTweaksEngine.saveExtra(CAPS_EXTRA, { removed: [...new Set([...(prevSnap.removed || []), ...removed])], recall: Boolean(prevSnap.recall) || recall === 'removed' });
    }
    const recallTxt = { removed: 'Recall removido', already: 'Recall já estava desativado', absent: 'Recall não existe neste Windows', error: 'Recall não pôde ser removido' }[recall] || recall;
    const parts = [];
    parts.push(removed.length ? `Removido(s): ${removed.map((n) => n.split('~')[0]).join(', ')}` : 'Nenhum dos componentes opcionais estava instalado');
    parts.push(recallTxt);
    if (removed.some((n) => /^Hello\.Face/i.test(n))) parts.push('Atenção: o login por reconhecimento facial (Windows Hello Face) deixa de funcionar');
    if (errors.length || recall === 'error') return { ok: false, error: `${parts.join('. ')}. Falharam: ${errors.map((n) => n.split('~')[0]).join(', ') || 'Recall'}.` };
    return { ok: true, verified: true, msg: `${parts.join('. ')}. Para reinstalar use "Reverter" (precisa de internet).` };
  }

  async restoreCapabilities() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const snap = DeepTweaksEngine.getExtra(CAPS_EXTRA);
    const names = (snap?.removed || []).filter(isValidCapabilityName);
    const recall = snap?.recall === true;
    if (!names.length && !recall) return { ok: false, error: 'Não há componentes removidos pelo DarkHub para reinstalar.' };
    const lines = names.map((n) => `Add-WindowsCapability -Online -Name ${psQuote(n)} -ErrorAction Stop | Out-Null\r\nWrite-Output ('DHADD|' + ${psQuote(n)})`);
    if (recall) lines.push("Enable-WindowsOptionalFeature -Online -FeatureName Recall -All -NoRestart -ErrorAction Stop | Out-Null\r\nWrite-Output 'DHRECALL|restored'");
    const r = await this._runMarked(lines.join('\r\n'), 900000);
    const added = [...r.out.matchAll(/^DHADD\|(.+)$/gm)].map((m) => m[1].trim());
    const recallBack = recall && /^DHRECALL\|restored/m.test(r.out);
    const left = names.filter((n) => !added.includes(n));
    const recallLeft = recall && !recallBack;
    if (!left.length && !recallLeft) DeepTweaksEngine.clearExtra(CAPS_EXTRA);
    else if (added.length || recallBack) DeepTweaksEngine.saveExtra(CAPS_EXTRA, { removed: left, recall: recallLeft });
    const total = names.length + (recall ? 1 : 0);
    const done = added.length + (recallBack ? 1 : 0);
    if (!r.ok) return { ok: false, error: `Falha ao reinstalar (${done}/${total} concluídos): ${r.error}` };
    const doneNames = [...added.map((n) => n.split('~')[0]), ...(recallBack ? ['Recall'] : [])];
    return { ok: true, requiresReboot: recallBack, msg: `${done} componente(s) reinstalado(s): ${doneNames.join(', ')}.${recallBack ? ' Reinicie o Windows para concluir o Recall.' : ''}` };
  }

  // ------------------------------------------------------------------ OneDrive / Explorer
  /**
   * Uninstalls OneDrive the supported way (OneDriveSetup.exe /uninstall) instead of deleting Windows system files,
   * removes its autostart entries and verifies the result. Local files in the OneDrive folder are NOT deleted, but
   * "online-only" placeholders can no longer be downloaded after the uninstall.
   */
  async deepCleanOneDrive() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const setup = [path.join(sysRoot, 'SysWOW64', 'OneDriveSetup.exe'), path.join(sysRoot, 'System32', 'OneDriveSetup.exe')].find((p) => fs.existsSync(p));
    const installedPaths = [
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'OneDrive', 'OneDrive.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft OneDrive', 'OneDrive.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft OneDrive', 'OneDrive.exe')
    ].filter(Boolean);
    const stillInstalled = () => installedPaths.some((p) => fs.existsSync(p));

    const deleteRun = async () => {
      for (const v of ['OneDrive', 'OneDriveSetup']) {
        try { await runCommand('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', v, '/f'], { timeoutMs: 10000 }); } catch { /* value absent */ }
      }
    };

    if (!stillInstalled()) {
      await deleteRun();
      return { ok: true, changed: false, msg: 'O OneDrive já não está instalado (entradas de inicialização removidas).' };
    }
    if (!setup) return { ok: false, error: 'OneDriveSetup.exe não encontrado; use Configurações > Aplicativos para desinstalar o OneDrive.' };

    try { await runCommand('taskkill.exe', ['/F', '/IM', 'OneDrive.exe'], { timeoutMs: 15000 }); } catch { /* not running */ }
    try {
      await runCommand(setup, ['/uninstall'], { timeoutMs: 180000 });
    } catch (e) {
      return { ok: false, error: `O desinstalador do OneDrive falhou: ${e?.message ?? e}` };
    }
    for (let i = 0; i < 20 && stillInstalled(); i++) await new Promise((res) => setTimeout(res, 1000));
    await deleteRun();
    if (stillInstalled()) {
      return { ok: false, error: 'O OneDrive continua instalado (instalação para todos os usuários exige executar o DarkHub como administrador ou desinstalar em Configurações > Aplicativos).' };
    }
    return { ok: true, verified: true, msg: 'OneDrive desinstalado e removido da inicialização (verificado). Seus arquivos locais foram mantidos, mas arquivos "somente online" deixam de poder ser baixados. Nenhum arquivo do Windows foi apagado.' };
  }

  async restartExplorer() {
    if (process.platform !== 'win32') return NOT_WINDOWS;
    const ok = await DeepTweaksEngine.restartExplorer();
    if (!ok) return { ok: false, error: 'Não foi possível reiniciar o Windows Explorer.' };
    await new Promise((res) => setTimeout(res, 1500));
    try {
      const r = await runCommand('tasklist.exe', ['/FI', 'IMAGENAME eq explorer.exe', '/NH'], { timeoutMs: 10000 });
      if (!/explorer\.exe/i.test(r.stdout || '')) return { ok: false, error: 'O Explorer foi encerrado, mas não voltou a iniciar. Abra o Gerenciador de Tarefas > Executar nova tarefa > explorer.exe.' };
    } catch (e) {
      Logger.warn('SystemEngine', 'Falha ao verificar o Explorer', e);
    }
    return { ok: true, verified: true, msg: 'Windows Explorer reiniciado (processo confirmado em execução).' };
  }
}

export default new SystemEngine();
