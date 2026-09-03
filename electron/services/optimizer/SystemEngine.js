import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import ElevationHelper from './ElevationHelper.js';

const execAsync = promisify(exec);

class SystemEngine {

  async createRestorePoint() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'Stop'
      Enable-ComputerRestore -Drive "C:\\" -ErrorAction SilentlyContinue
      Checkpoint-Computer -Description "DarkHub Optimizer Checkpoint" -RestorePointType "MODIFY_SETTINGS" -ErrorAction Stop
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao criar checkpoint (Pode estar desativado no Windows)' };
    return { ok: true, msg: 'Ponto de restauração criado com sucesso' };
  }

  async cleanRegistryAndTemp() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };

    const script = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Chaves MRU (Most Recently Used) do Explorer para privacidade e redução de lentidao
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU" -Name "*" -Force
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths" -Name "*" -Force
      Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs" -Name "*" -Force

      # 2. IconCache para reparar problemas graficos
      Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force

      # 3. Limpeza severa de pastas locais
      Remove-Item -Path "$env:TEMP\\*" -Recurse -Force
      Remove-Item -Path "$env:WINDIR\\Temp\\*" -Recurse -Force
      Remove-Item -Path "$env:WINDIR\\Prefetch\\*" -Recurse -Force
      Remove-Item -Path "$env:WINDIR\\SoftwareDistribution\\Download\\*" -Recurse -Force
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Limpeza de registro MRU e Temp concluída nativamente' };
  }

  async repairWindows() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };

    const script = `Start-Process cmd.exe -ArgumentList "/k echo Reparando arquivos do Windows, aguarde... && sfc /scannow && DISM /Online /Cleanup-Image /RestoreHealth" -Verb RunAs`;

    await ElevationHelper.runElevatedPowerShell(script);
    return { ok: true, msg: 'Processo de Reparo Avançado do Windows iniciado externamente' };
  }

  async activateWindows() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };

    const script = `Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command irm https://massgrave.dev/get | iex" -Verb RunAs`;
    await ElevationHelper.runElevatedPowerShell(script);
    return { ok: true, msg: 'Interface nativa de Ativação (MAS) lançada.' };
  }

  async setPerformanceMode(mode) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };

    const guids = {
      'high': '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
      'ultimate': 'e9a42b02-d5df-448d-aa00-03f14749eb61'
    };
    const targetGuid = guids[mode] || guids['high'];

    const script = `
      if ('${mode}' -eq 'ultimate') {
        powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61
      }
      powercfg -setactive ${targetGuid}
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: `Plano de energia alterado para ${mode}` };
  }

  async applyHardcoreGamerMode() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      # Desativa Isolamento de Nucleo
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 0 /f
      # Desativa VBS (Virtualization Based Security)
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 0 /f
      # Desativa Smart App Control
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy" /v VerifiedAndReputablePolicyState /t REG_DWORD /d 0 /f

      # Outras configs do bat: Desabilitar Hibernacao Pesada e Acesso de Ultima Data (SSD)
      fsutil.exe behavior set disableLastAccess 1
      powercfg -h off
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Modo Hardcore Ativado! ALERTA: Proteções (VBS/Core Isolation) desligadas!' };
  }

  async revertHardcoreGamerMode() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      # Restaura Isolamento de Nucleo e VBS
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity" /v Enabled /t REG_DWORD /d 1 /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard" /v EnableVirtualizationBasedSecurity /t REG_DWORD /d 1 /f

      # Reverte comportamento de FS
      fsutil.exe behavior set disableLastAccess 0
      powercfg -h on
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Proteções vitais do Windows restauradas.' };
  }

  async setPagefile(initialMb, maxMb) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const init = Number(initialMb) || 1024;
    const max = Number(maxMb) || 4096;
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
      if ($cs) {
        Set-CimInstance -InputObject $cs -Property @{ AutomaticManagedPagefile = $false } -ErrorAction SilentlyContinue
      }
      $pf = Get-CimInstance Win32_PageFileSetting -ErrorAction SilentlyContinue
      if ($pf) {
        Set-CimInstance -InputObject $pf -Property @{ InitialSize = ${init}; MaximumSize = ${max} } -ErrorAction SilentlyContinue
      } else {
        New-CimInstance -ClassName Win32_PageFileSetting -Property @{ Name = 'C:\\pagefile.sys'; InitialSize = ${init}; MaximumSize = ${max} } -ErrorAction SilentlyContinue
      }
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v PagingFiles /t REG_MULTI_SZ /d "C:\\pagefile.sys ${init} ${max}" /f
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao configurar arquivo de paginação' };
    return { ok: true, msg: `Arquivo de paginação ajustado para Inicial: ${init}MB, Máx: ${max}MB` };
  }

  async toggleHibernation(enable) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const state = enable ? 'on' : 'off';
    const script = `powercfg -h ${state}`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || `Falha ao alterar hibernação para ${state}` };
    return { ok: true, msg: `Hibernação do sistema ${enable ? 'ativada' : 'desativada'} com sucesso.` };
  }

  async setExecutionPolicy(policy) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const allowed = ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass', 'Undefined'];
    const safePolicy = allowed.includes(policy) ? policy : 'RemoteSigned';
    const script = `Set-ExecutionPolicy -ExecutionPolicy ${safePolicy} -Scope LocalMachine -Force; Set-ExecutionPolicy -ExecutionPolicy ${safePolicy} -Scope CurrentUser -Force`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || `Falha ao alterar política de execução para ${safePolicy}` };
    return { ok: true, msg: `Política de execução do PowerShell alterada para ${safePolicy}` };
  }

  async toggleFeature(feature, enable = true) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const featureMap = {
      'wsl': 'Microsoft-Windows-Subsystem-Linux',
      'hyperv': 'Microsoft-Hyper-V-All',
      'sandbox': 'Containers-DisposableClientVM',
      'vmplatform': 'VirtualMachinePlatform'
    };
    const featureName = featureMap[feature] || feature;
    const cmd = enable ? 'Enable-WindowsOptionalFeature' : 'Disable-WindowsOptionalFeature';
    const script = `${cmd} -Online -FeatureName "${featureName}" -NoRestart -ErrorAction SilentlyContinue`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 180000 });
    if (code !== 0) return { ok: false, error: stderr || `Falha ao configurar recurso ${featureName}` };
    return { ok: true, msg: `Recurso ${featureName} ${enable ? 'habilitado' : 'desabilitado'}. (Pode exigir reinicialização do sistema)` };
  }

  async removeCapabilitiesAndRecall() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $capabilities = @(
        'OneCoreUAP.OneSync', 'App.Support.QuickAssist', 'Hello.Face.18967',
        'Hello.Face.Migration.18967', 'Hello.Face.20134', 'Microsoft.Windows.WordPad'
      )
      foreach ($cap in $capabilities) {
        Get-WindowsCapability -Online | Where-Object { ($_.Name -split '~')[0] -eq $cap } | Remove-WindowsCapability -Online -ErrorAction SilentlyContinue
      }
      Disable-WindowsOptionalFeature -Online -FeatureName "Recall" -Remove -NoRestart -ErrorAction SilentlyContinue
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 180000 });
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Capabilities obsoletas e Windows Recall removidos com sucesso.' };
  }

  async deepCleanOneDrive() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      Stop-Process -Name "OneDrive" -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath 'C:\\Windows\\System32\\OneDriveSetup.exe', 'C:\\Windows\\SysWOW64\\OneDriveSetup.exe' -Force -ErrorAction SilentlyContinue
      Remove-ItemProperty -LiteralPath 'Registry::HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'OneDriveSetup' -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath "$env:USERPROFILE\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\OneDrive.lnk" -Force -ErrorAction SilentlyContinue
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'OneDrive e executáveis de instalação removidos completamente.' };
  }

  async restartExplorer() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      await execAsync('powershell -NoProfile -Command "Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600; Start-Process explorer.exe"');
    } catch {
      try {
        await execAsync('cmd.exe /c "taskkill /f /im explorer.exe & start explorer.exe"');
      } catch {}
    }
    return { ok: true, msg: 'Windows Explorer reiniciado com sucesso.' };
  }

  async applyMsiMode() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $count = 0
      Get-ChildItem -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Enum\\PCI" -Recurse | Where-Object { $_.Name -like "*\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties" } | ForEach-Object {
        Set-ItemProperty -Path $_.PSPath -Name "MSISupported" -Value 1 -Type DWord -Force
        Set-ItemProperty -Path $_.PSPath -Name "MessageNumberLimit" -Value 2048 -Type DWord -Force
        $parent = Split-Path $_.PSPath -Parent
        $affinityPath = Join-Path $parent "Affinity Policy"
        if (-not (Test-Path $affinityPath)) { New-Item -Path $affinityPath -Force | Out-Null }
        Set-ItemProperty -Path $affinityPath -Name "DevicePriority" -Value 3 -Type DWord -Force
        $count++
      }
      Write-Output $count
    `;
    const { code, stdout, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: `MSI Mode e prioridade de interrupção High ativados em ${stdout.trim() || 'vários'} dispositivos PCI.` };
  }

  async applyExtremeKernelMod() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" /v Win32PrioritySeparation /t REG_DWORD /d 38 /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v DisablePagingExecutive /t REG_DWORD /d 1 /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management" /v LargeSystemCache /t REG_DWORD /d 0 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 4294967295 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Priority" /t REG_DWORD /d 6 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "Scheduling Category" /t REG_SZ /d "High" /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "SFIO Priority" /t REG_SZ /d "High" /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" /v HwSchMode /t REG_DWORD /d 2 /f
      fsutil behavior set disablelastaccess 1
      fsutil behavior set disable8dot3 1
      fsutil behavior set memoryusage 2
      bcdedit /set disabledynamictick yes
      bcdedit /set useplatformtick yes
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Mod Extremo de Kernel e Latência aplicado com sucesso (Win32PrioritySeparation 0x26, MMCSS, HAGS, NTFS).' };
  }

  async applyExtremeNetworkMod() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      netsh int tcp set global rss=enabled
      netsh int tcp set global rsc=disabled
      netsh int tcp set global autotuninglevel=normal
      netsh int tcp set global ecncapability=enabled
      netsh int tcp set global timestamps=disabled
      netsh int tcp set global initialRto=2000
      netsh int ip set global taskoffload=enabled
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v DefaultTTL /t REG_DWORD /d 64 /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v EnableTCPA /t REG_DWORD /d 1 /f
      reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters" /v EnableRSS /t REG_DWORD /d 1 /f
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Pilha TCP/IP otimizada para latência ultra-baixa e estabilidade de pacotes.' };
  }

  async applyCpuUnpark() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      powercfg -setacvalueindex scheme_current sub_processor CPMINCORES 100
      powercfg -setacvalueindex scheme_current sub_processor CPMAXCORES 100
      powercfg -setacvalueindex scheme_current sub_processor PROCFREQMAX 0
      powercfg -setactive scheme_current
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Todos os núcleos da CPU desestacionados (100% Core Unparked).' };
  }
}

export default new SystemEngine();
