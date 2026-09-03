import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import si from 'systeminformation';
import ElevationHelper from './ElevationHelper.js';
import { runPowerShell as runPowerShellShared } from '../PowerShellRunner.js';

const execAsync = promisify(exec);

class AppManagerEngine {
  constructor() {
    this.allowedStartupRegistryPaths = new Set([
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
    ]);
  }

  async runPowerShellJson(script, fallback = []) {
    try {
      const { code, stdout } = await runPowerShellShared(script, { timeoutMs: 15000, trim: true });
      if (code !== 0) return { data: fallback };
      return { data: JSON.parse(stdout || 'null') ?? fallback };
    } catch (e) {
      return { data: fallback };
    }
  }

  async runPowerShell(script) {
    try {
      const { code, stdout, stderr } = await runPowerShellShared(script, { timeoutMs: 15000, trim: true });
      return { code, stdout, stderr };
    } catch (e) {
      return { code: 1, stderr: e.message };
    }
  }

  async getStartupItems() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `
      $items = @()
      $paths = @(
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
        'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
      )
      foreach ($p in $paths) {
        if (Test-Path $p) {
          $props = Get-ItemProperty $p -ErrorAction SilentlyContinue
          if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
              $items += [PSCustomObject]@{ name = $_.Name; cmd = $_.Value; type = 'Registry'; path = $p }
            }
          }
        }
      }
      $startupFolders = @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))
      foreach ($folder in $startupFolders) {
        if (Test-Path $folder) {
          Get-ChildItem -Path $folder -Filter *.lnk -ErrorAction SilentlyContinue | ForEach-Object {
            $sh = New-Object -ComObject WScript.Shell
            $target = $sh.CreateShortcut($_.FullName).TargetPath
            $items += [PSCustomObject]@{ name = $_.BaseName; cmd = $target; type = 'Folder'; path = $_.FullName }
          }
        }
      }
      $items | ConvertTo-Json -Compress
    `;
    const { data } = await this.runPowerShellJson(script, []);
    let items = Array.isArray(data) ? data : data ? [data] : [];
    return { ok: true, items };
  }

  async disableStartupItem({ name, type, path }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    let script = '';
    let verifyScript = '';
    const safePath = path.replace(/'/g, "''");
    const safeName = name.replace(/'/g, "''");

    if (type === 'Registry') {

      script = `Remove-ItemProperty -LiteralPath '${safePath}' -Name '${safeName}' -ErrorAction Stop`;
      verifyScript = `if (Test-Path '${safePath}') { (Get-ItemProperty -LiteralPath '${safePath}' -Name '${safeName}' -ErrorAction SilentlyContinue) -ne $null } else { $false }`;
    } else if (type === 'Folder') {
      script = `Remove-Item -LiteralPath '${safePath}' -Force -ErrorAction Stop`;
      verifyScript = `Test-Path -LiteralPath '${safePath}'`;
    } else {
      return { ok: false, error: 'Invalid type' };
    }

    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };

    const verify = await this.runPowerShell(verifyScript);
    const stillExists = String(verify.stdout || '').trim().toLowerCase() === 'true';
    if (stillExists) {
      return { ok: true, msg: `Comando executado, mas a verificação pós-aplicação indica que o item ainda existe: ${name}`, verified: false };
    }
    return { ok: true, msg: `Disabled startup item: ${name}`, verified: true };
  }

  async getServices() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `Get-Service | Where-Object {$_.Status -eq 'Running'} | Select-Object Name, DisplayName | ConvertTo-Json -Compress`;
    const { data } = await this.runPowerShellJson(script, []);
    return { ok: true, services: Array.isArray(data) ? data : data ? [data] : [] };
  }

  async disableService(name) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const safeName = name.replace(/'/g, "''");
    // Parar/desabilitar a maioria dos serviços do Windows exige admin;
    // antes rodava via execAsync não elevado e falhava silenciosamente
    // (o exit code de erro chegava, mas sem popup UAC o usuário não tinha
    // como saber que precisava de admin).
    const script = `Stop-Service -Name '${safeName}' -Force -ErrorAction SilentlyContinue; Set-Service -Name '${safeName}' -StartupType Disabled -ErrorAction Stop`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };

    // Verificação pós-aplicação: relê o Start Mode via `sc qc` (leitura,
    // não precisa elevação) para confirmar que a mudança persistiu.
    const check = await execAsync(`sc qc "${name.replace(/"/g, '')}"`).catch((e) => ({ stdout: e.stdout || '' }));
    const match = String(check.stdout || '').match(/START_TYPE\s*:\s*\d+\s+([A-Z_]+)/i);
    const actual = match ? match[1].toUpperCase() : null;
    if (actual !== 'DISABLED') {
      return { ok: true, msg: `Comando executado, mas a verificação pós-aplicação não confirmou o serviço ${name} como desabilitado (estado atual: ${actual ?? 'desconhecido'}).`, verified: false };
    }
    return { ok: true, msg: `Service ${name} stopped and disabled`, verified: true };
  }

  async getInstalledPrograms() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `
      $paths = @(
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
      )
      Get-ItemProperty $paths -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -and $_.UninstallString } |
      Select-Object DisplayName, UninstallString |
      Sort-Object DisplayName |
      ConvertTo-Json -Compress
    `;
    const { data } = await this.runPowerShellJson(script, []);
    const programs = Array.isArray(data) ? data : data ? [data] : [];

    const unique = [];
    const seen = new Set();
    for (const p of programs) {
      if (!seen.has(p.DisplayName)) {
        seen.add(p.DisplayName);
        unique.push(p);
      }
    }
    return { ok: true, programs: unique };
  }

  async uninstallProgram(uninstallString) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const command = uninstallString.replace(/'/g, "''");

    const script = `Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', '${command}') -Wait -WindowStyle Normal`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 300000 });
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao executar o desinstalador (UAC pode ter sido cancelado).' };
    return { ok: true, msg: `Uninstallation finished.` };
  }

  async listBloatware() {
    const potentialBloatware = [
      { id: "Microsoft.Copilot", name: "Microsoft Copilot" },
      { id: "Microsoft.Windows.Ai.Copilot.Provider", name: "Windows AI Copilot Provider" },
      { id: "Microsoft.549981C3F5F10", name: "Cortana Voice Assistant" },
      { id: "Microsoft.MicrosoftOfficeHub", name: "Microsoft 365 Copilot & Office Hub" },
      { id: "Microsoft.OneDrive", name: "Microsoft OneDrive" },
      { id: "Microsoft.BingSearch", name: "Bing Search" },
      { id: "Microsoft.BingNews", name: "Bing News (Notícias)" },
      { id: "Microsoft.BingWeather", name: "Bing Weather (Clima)" },
      { id: "MicrosoftCorporationII.MicrosoftFamily", name: "Microsoft Family Safety" },
      { id: "Microsoft.WindowsFeedbackHub", name: "Feedback Hub (Hub de Comentários)" },
      { id: "Microsoft.GetHelp", name: "Get Help (Obter Ajuda)" },
      { id: "Microsoft.Getstarted", name: "Get Started (Dicas)" },
      { id: "microsoft.windowscommunicationsapps", name: "Email e Calendário" },
      { id: "Microsoft.WindowsMaps", name: "Windows Maps (Mapas)" },
      { id: "Microsoft.MixedReality.Portal", name: "Mixed Reality Portal" },
      { id: "Microsoft.Office.OneNote", name: "OneNote for Windows" },
      { id: "Microsoft.OutlookForWindows", name: "Novo Outlook para Windows" },
      { id: "Microsoft.MSPaint", name: "Paint 3D / MSPaint UWP" },
      { id: "Microsoft.People", name: "Pessoas (People)" },
      { id: "MicrosoftCorporationII.QuickAssist", name: "Quick Assist (Assistência Rápida)" },
      { id: "Microsoft.SkypeApp", name: "Skype" },
      { id: "Microsoft.MicrosoftSolitaireCollection", name: "Solitaire Collection" },
      { id: "Microsoft.MicrosoftStickyNotes", name: "Sticky Notes (Notas Autoadesivas)" },
      { id: "Microsoft.Todos", name: "Microsoft To Do" },
      { id: "Microsoft.Wallet", name: "Microsoft Wallet" },
      { id: "Microsoft.YourPhone", name: "Vincular Celular (Phone Link)" },
      { id: "Microsoft.XboxApp", name: "Xbox App" },
      { id: "Microsoft.ZuneMusic", name: "Groove Music (Mídia Antiga)" },
      { id: "Microsoft.ZuneVideo", name: "Filmes e TV" },
      { id: "Microsoft.3DBuilder", name: "3D Builder" }
    ];
    return { ok: true, apps: potentialBloatware };
  }

  async removeSelectedBloatware(appsToRemove) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const validIds = appsToRemove.map((id) => String(id ?? '').trim()).filter((id) => /^[A-Za-z0-9_.-]{1,120}$/.test(id));
    if (validIds.length === 0) return { ok: false, error: 'No valid apps selected' };

    const idsStr = validIds.map(id => `'${id}'`).join(',');
    const script = `
      $ErrorActionPreference = 'Continue'
      $ids = @(${idsStr})
      foreach ($id in $ids) {
        # 1. Remove UWP do usuario atual
        try { Get-AppxPackage "*$id*" -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue } catch {}
        # 2. Remove de todos os usuarios
        try { Get-AppxPackage -AllUsers "*$id*" -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue } catch {}
        # 3. Remove da imagem do sistema (Provisioned) para nao reinstalar
        try { Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { $_.PackageName -like "*$id*" } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue } catch {}
      }

      # Tratamento especial para Copilot e IA
      if ($ids -contains 'Microsoft.CoPilot' -or $ids -contains 'Microsoft.MicrosoftOfficeHub') {
        # Remover pacotes de aplicativo do Copilot e Office Hub
        $copilotPkgs = @('*Microsoft.CoPilot*', '*Microsoft.Windows.Ai.Copilot*', '*Microsoft.MicrosoftOfficeHub*')
        foreach ($pkg in $copilotPkgs) {
          try { Get-AppxPackage $pkg -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue } catch {}
          try { Get-AppxPackage -AllUsers $pkg -ErrorAction SilentlyContinue | Remove-AppxPackage -AllUsers -ErrorAction SilentlyContinue } catch {}
          try { Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Where-Object { $_.PackageName -like $pkg } | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue } catch {}
        }

        # Remover PWAs e desinstaladores do registro
        $paths = @(
          'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
          'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
        )
        Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Copilot' } | ForEach-Object {
          if ($_.QuietUninstallString) {
             Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "$($_.QuietUninstallString)" -Wait -WindowStyle Hidden
          } elseif ($_.UninstallString) {
             $unCmd = $_.UninstallString -replace '"', ''
             Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "\\"$unCmd\\" --force-uninstall" -Wait -WindowStyle Hidden
          }
        }

        # Politicas para ocultar e desativar o Copilot da barra de tarefas e pesquisa do Windows
        reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot" /v "TurnOffWindowsCopilot" /t REG_DWORD /d 1 /f | Out-Null
        reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot" /v "TurnOffWindowsCopilot" /t REG_DWORD /d 1 /f | Out-Null
        reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" /v "ShowCopilotButton" /t REG_DWORD /d 0 /f | Out-Null
        reg add "HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI" /v "DisableAIDataAnalysis" /t REG_DWORD /d 1 /f | Out-Null
        reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI" /v "DisableAIDataAnalysis" /t REG_DWORD /d 1 /f | Out-Null
      }

      # Tratamento especial para OneDrive
      if ($ids -contains 'Microsoft.OneDrive') {
        Stop-Process -Name "OneDrive" -Force -ErrorAction SilentlyContinue
        $setup64 = "$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe"
        $setup32 = "$env:SystemRoot\\System32\\OneDriveSetup.exe"
        if (Test-Path $setup64) {
          Start-Process -FilePath $setup64 -ArgumentList "/uninstall" -Wait -WindowStyle Hidden
        } elseif (Test-Path $setup32) {
          Start-Process -FilePath $setup32 -ArgumentList "/uninstall" -Wait -WindowStyle Hidden
        }
      }
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: `Aplicativos selecionados removidos com sucesso (${validIds.length})` };
  }

  async getRunningProcesses() {
    try {
      let list = [];
      try {
        const processes = await si.processes();
        if (processes && Array.isArray(processes.list) && processes.list.length > 0) {
          list = processes.list
            .filter(p => p.pid > 4 && p.name && p.name !== 'System Idle Process' && p.name !== 'svchost.exe' && p.name !== 'Registry')
            .map(p => ({
              pid: p.pid,
              name: p.name,
              mem: p.memRss || (p.mem_rss ? Math.round(p.mem_rss / 1024) : 0),
              cpu: Math.round(p.cpu || 0),
              path: p.path || ''
            }));
        }
      } catch {}

      if (list.length === 0 && process.platform === 'win32') {
        const script = `
          Get-Process | Where-Object { $_.Id -gt 4 -and $_.ProcessName -ne 'svchost' } |
          Select-Object Id, ProcessName, WorkingSet64, Path |
          Sort-Object WorkingSet64 -Descending |
          Select-Object -First 100 |
          ConvertTo-Json -Compress
        `;
        const { data } = await this.runPowerShellJson(script, []);
        const psList = Array.isArray(data) ? data : data ? [data] : [];
        list = psList.map(p => ({
          pid: p.Id,
          name: p.ProcessName ? (p.ProcessName.endsWith('.exe') ? p.ProcessName : p.ProcessName + '.exe') : 'Unknown',
          mem: Math.round((p.WorkingSet64 || 0) / 1024),
          cpu: 0,
          path: p.Path || ''
        }));
      }

      list.sort((a, b) => b.mem - a.mem);
      return { ok: true, processes: list.slice(0, 100) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async setProcessPriority({ pid, priority }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const priorityMap = { 'high': 128, 'realtime': 256, 'abovenormal': 32768, 'normal': 32, 'belownormal': 16384, 'low': 64 };
    const priorityClass = priorityMap[priority] || 128;
    const priorityName = priorityClass === 128 ? 'High' : priorityClass === 256 ? 'RealTime' : priorityClass === 32768 ? 'AboveNormal' : priorityClass === 16384 ? 'BelowNormal' : priorityClass === 64 ? 'Idle' : 'Normal';

    const safePid = Number(pid);
    if (!Number.isFinite(safePid) || safePid <= 0) return { ok: false, error: 'Invalid PID' };

    const script = `(Get-Process -Id ${safePid} -ErrorAction Stop).PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priorityName}`;
    let { code, stderr } = await this.runPowerShell(script);
    if (code !== 0) {
      const elevated = await ElevationHelper.runElevatedPowerShell(script);
      code = elevated.code;
      stderr = elevated.stderr;
    }
    if (code !== 0) return { ok: false, error: stderr };

    const verifyScript = `(Get-Process -Id ${safePid} -ErrorAction SilentlyContinue).PriorityClass`;
    const verify = await this.runPowerShell(verifyScript);
    const actual = String(verify.stdout || '').trim();
    if (actual && actual !== priorityName) {
      return { ok: true, msg: `Comando executado, mas a verificação pós-aplicação encontrou prioridade "${actual}" em vez de "${priorityName}" para o processo ${pid}.`, verified: false };
    }
    return { ok: true, msg: `Prioridade do processo ${pid} definida para ${priorityName}`, verified: true };
  }

  async getGpuPreferences() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `
      $path = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
      if (Test-Path $path) {
        $props = Get-ItemProperty -Path $path
        $list = @()
        $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
          $val = [string]$_.Value
          $pref = 'default'
          if ($val -match 'GpuPreference=2') { $pref = 'high_performance' }
          elseif ($val -match 'GpuPreference=1') { $pref = 'power_saving' }
          elseif ($val -match 'GpuPreference=0') { $pref = 'default' }

          $list += [PSCustomObject]@{
            appPath = $_.Name
            appName = [System.IO.Path]::GetFileName($_.Name)
            preference = $pref
            rawValue = $val
          }
        }
        $list | ConvertTo-Json -Compress
      } else {
        @() | ConvertTo-Json -Compress
      }
    `;
    const { data } = await this.runPowerShellJson(script, []);
    const items = Array.isArray(data) ? data : (data && data.appPath ? [data] : []);
    return { ok: true, preferences: items };
  }

  async setGpuPreference({ appPath, preference = 'high_performance' }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    if (!appPath || typeof appPath !== 'string') return { ok: false, error: 'Invalid app path' };

    const safePath = appPath.replace(/'/g, "''");
    let prefValue = 'GpuPreference=2;'; // 2 = High Performance (Dedicated GPU)
    if (preference === 'power_saving') prefValue = 'GpuPreference=1;'; // 1 = Power Saving (Integrated GPU)
    else if (preference === 'default') prefValue = 'GpuPreference=0;'; // 0 = Default / Let Windows Decide

    const script = `
      $regPath = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
      if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
      }
      Set-ItemProperty -Path $regPath -Name '${safePath}' -Value '${prefValue}' -Type String -Force
    `;
    const res = await this.runPowerShell(script);
    if (res.code !== 0) return { ok: false, error: res.stderr || 'Failed to set GPU preference' };
    return { ok: true, msg: `Preferência de GPU (${preference === 'high_performance' ? 'GPU Dedicada (Alto Desempenho)' : preference === 'power_saving' ? 'GPU Integrada (Economia)' : 'Padrão'}) aplicada para: ${appPath}` };
  }

  async removeGpuPreference({ appPath }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    if (!appPath || typeof appPath !== 'string') return { ok: false, error: 'Invalid app path' };
    const safePath = appPath.replace(/'/g, "''");
    const script = `
      $regPath = 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'
      if (Test-Path $regPath) {
        Remove-ItemProperty -Path $regPath -Name '${safePath}' -ErrorAction SilentlyContinue
      }
    `;
    await this.runPowerShell(script);
    return { ok: true, msg: `Preferência de GPU removida com sucesso.` };
  }

  async getGpuInfo() {
    try {
      const graphics = await si.graphics();
      const controllers = (graphics.controllers || []).map(c => {
        const nameLower = (c.model || '').toLowerCase();
        const vendorLower = (c.vendor || '').toLowerCase();
        const isIntel = nameLower.includes('intel') || vendorLower.includes('intel');
        const isAmdApu = nameLower.includes('vega') || nameLower.includes('radeon(tm) graphics');
        const isDedicated = !isIntel && !isAmdApu && (c.vram > 1024 || vendorLower.includes('nvidia') || nameLower.includes('rtx') || nameLower.includes('gtx') || nameLower.includes('geforce') || nameLower.includes('rx '));
        return {
          model: c.model || 'Placa Gráfica',
          vendor: c.vendor || '',
          vram: c.vram || 0,
          bus: c.bus || '',
          isDedicated
        };
      });
      return { ok: true, controllers };
    } catch (e) {
      return { ok: false, error: e.message, controllers: [] };
    }
  }

  async getHagsStatus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const script = `(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -ErrorAction SilentlyContinue).HwSchMode`;
    const res = await this.runPowerShell(script);
    const val = String(res.stdout || '').trim();
    return { ok: true, enabled: val === '2', value: val };
  }

  async setHagsStatus({ enabled }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const val = enabled ? 2 : 1;
    const script = `Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name 'HwSchMode' -Value ${val} -Type DWord -Force`;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao ajustar HAGS' };
    return { ok: true, msg: `HAGS ${enabled ? 'ativado' : 'desativado'}. Reinicie o Windows para surtir efeito completo.` };
  }

  async getInstalledPrograms() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows', programs: [] };
    const script = `
      $paths = @(
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
      )
      $list = @()
      Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' -and $_.SystemComponent -ne 1 -and $_.ParentKeyName -eq $null } | ForEach-Object {
        $name = $_.DisplayName.Trim()
        $unStr = if ($_.QuietUninstallString) { $_.QuietUninstallString } else { $_.UninstallString }
        if ($unStr) {
          $list += [PSCustomObject]@{
            name = $name
            version = if ($_.DisplayVersion) { $_.DisplayVersion } else { '' }
            publisher = if ($_.Publisher) { $_.Publisher } else { '' }
            installDate = if ($_.InstallDate) { $_.InstallDate } else { '' }
            installLocation = if ($_.InstallLocation) { $_.InstallLocation } else { '' }
            uninstallString = $unStr
            isQuiet = [bool]$_.QuietUninstallString
          }
        }
      }
      $unique = $list | Sort-Object name -Unique
      $unique | ConvertTo-Json -Compress
    `;
    const { data } = await this.runPowerShellJson(script, []);
    const items = Array.isArray(data) ? data : (data && data.name ? [data] : []);
    return { ok: true, programs: items };
  }

  async uninstallProgramWithLeftovers({ name, uninstallString, installLocation, publisher }) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    if (!name || !uninstallString) return { ok: false, error: 'Dados do programa inválidos' };

    const safeName = name.replace(/'/g, "''").replace(/["*?]/g, '');
    const safePub = (publisher || '').replace(/'/g, "''").replace(/["*?]/g, '');
    const safeLoc = (installLocation || '').replace(/'/g, "''");

    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      
      # 1. Executa desinstalador oficial
      $unCmd = '${uninstallString.replace(/'/g, "''")}'
      if ($unCmd -match '^msiexec') {
        Start-Process -FilePath "msiexec.exe" -ArgumentList ($unCmd -replace '^msiexec(\\.exe)?\\s*', '') -Wait
      } else {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "\\"$unCmd\\"" -Wait
      }

      Start-Sleep -Seconds 2

      $leftoverCount = 0
      $cleanedPaths = @()

      # 2. Limpeza profunda de pastas residuais (AppData, ProgramData, InstallLocation)
      $foldersToClean = @(
        "$env:APPDATA\\${safeName}",
        "$env:LOCALAPPDATA\\${safeName}",
        "$env:ProgramData\\${safeName}",
        "${safeLoc}"
      )
      if ('${safePub}' -ne '') {
        $foldersToClean += "$env:APPDATA\\${safePub}\\${safeName}"
        $foldersToClean += "$env:LOCALAPPDATA\\${safePub}\\${safeName}"
      }

      foreach ($f in $foldersToClean) {
        if ($f -and (Test-Path -LiteralPath $f) -and $f -ne "$env:SystemDrive\\" -and $f -ne "$env:ProgramFiles" -and $f -ne "$env:ProgramFiles(x86)") {
          try {
            Remove-Item -LiteralPath $f -Recurse -Force -ErrorAction SilentlyContinue
            $leftoverCount++
            $cleanedPaths += $f
          } catch {}
        }
      }

      # 3. Limpeza profunda de chaves no Registro
      $regKeys = @(
        "HKCU:\\Software\\${safeName}",
        "HKLM:\\SOFTWARE\\${safeName}",
        "HKLM:\\SOFTWARE\\WOW6432Node\\${safeName}"
      )
      if ('${safePub}' -ne '') {
        $regKeys += "HKCU:\\Software\\${safePub}\\${safeName}"
        $regKeys += "HKLM:\\SOFTWARE\\${safePub}\\${safeName}"
      }

      foreach ($rk in $regKeys) {
        if (Test-Path -LiteralPath $rk) {
          try {
            Remove-Item -LiteralPath $rk -Recurse -Force -ErrorAction SilentlyContinue
            $leftoverCount++
            $cleanedPaths += $rk
          } catch {}
        }
      }

      [PSCustomObject]@{
        ok = $true
        leftoverCount = $leftoverCount
        cleanedPaths = $cleanedPaths
      } | ConvertTo-Json -Compress
    `;

    const { code, stdout, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr || 'Falha ao desinstalar programa' };

    let result = { leftoverCount: 0, cleanedPaths: [] };
    try {
      if (stdout) result = JSON.parse(stdout);
    } catch {}

    return {
      ok: true,
      msg: `"${name}" desinstalado com sucesso! Removidos ${result.leftoverCount || 0} resíduos e sobras do sistema.`,
      leftoversRemoved: result.leftoverCount || 0
    };
  }
}

export default new AppManagerEngine();
