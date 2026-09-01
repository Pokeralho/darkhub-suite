import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import ElevationHelper from './ElevationHelper.js';

const execAsync = promisify(exec);

class NetworkEngine {
  async getActiveAdapterName() {
    const ps = `
      $ErrorActionPreference='Stop'
      $a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1
      if ($null -eq $a) { '' } else { $a.Name }
    `;
    try {
      const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${ps.replace(/\n/g, '')}"`);
      return String(stdout).trim();
    } catch {
      return '';
    }
  }

  async flushDns() {
    try {
      const { stdout } = await execAsync('ipconfig /flushdns');
      return {
        status: 'Success',
        durationMs: 0,
        affectedResources: ['DNS Cache'],
        processedItems: 1,
        savings: 0,
        message: stdout.replace(/\n/g, '').trim() || 'Cache DNS limpo com sucesso.'
      };
    } catch (e) {
      return {
        status: 'Error',
        durationMs: 0,
        affectedResources: ['DNS Cache'],
        processedItems: 0,
        savings: 0,
        message: `Falha: ${e.message}`
      };
    }
  }

  async cleanNetwork() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      ipconfig /flushdns
      ipconfig /release
      ipconfig /renew
      netsh winsock reset
      netsh int ip reset
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Rede redefinida (Winsock, IP, DNS) com sucesso' };
  }

  async advancedNetworkApply() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const adapter = await this.getActiveAdapterName();

    let script = `
      $ErrorActionPreference = 'SilentlyContinue'
      reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched /v NonBestEffortLimit /t REG_DWORD /d 0 /f

      $tcpKey = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters'
      reg add $tcpKey /v TcpAckFrequency /t REG_DWORD /d 1 /f
      reg add $tcpKey /v TCPNoDelay /t REG_DWORD /d 1 /f
      reg add $tcpKey /v MaxConnectionsPerServer /t REG_DWORD /d 16 /f
      reg add $tcpKey /v DefaultTTL /t REG_DWORD /d 64 /f
      reg add $tcpKey /v TcpMaxDataRetransmissions /t REG_DWORD /d 3 /f

      netsh interface ip delete arpcache
      netsh int tcp set global rss=enabled

      Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
        Set-NetAdapterAdvancedProperty -Name $_.Name -DisplayName 'Energy-Efficient Ethernet' -DisplayValue 'Disabled'
        Set-NetAdapterRss -Name $_.Name -NumberOfReceiveQueues 4
      }
    `;

    if (adapter) {
      script += `\nnetsh interface ipv4 set subinterface "${adapter}" mtu=1500 store=persistent`;
    }

    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: adapter ? `Otimização avançada aplicada no adaptador ${adapter}` : 'Otimização avançada de rede aplicada' };
  }

  async advancedNetworkRevert() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const adapter = await this.getActiveAdapterName();

    let script = `
      $ErrorActionPreference = 'SilentlyContinue'
      reg delete HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Psched /v NonBestEffortLimit /f

      $tcpKey = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters'
      reg delete $tcpKey /v TcpAckFrequency /f
      reg delete $tcpKey /v TCPNoDelay /f
      reg delete $tcpKey /v MaxConnectionsPerServer /f
      reg delete $tcpKey /v DefaultTTL /f
      reg delete $tcpKey /v TcpMaxDataRetransmissions /f

      netsh interface ip delete arpcache
      netsh int tcp set global rss=default

      Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
        Set-NetAdapterAdvancedProperty -Name $_.Name -DisplayName 'Energy-Efficient Ethernet' -DisplayValue 'Enabled'
      }
    `;

    if (adapter) {
      script += `\nnetsh interface ipv4 set subinterface "${adapter}" mtu=auto store=persistent`;
    }

    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: adapter ? `Rede restaurada no adaptador ${adapter}` : 'Rede restaurada' };
  }

  async optimizeGameRoute() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      # Network Throttling Index (Jogos)
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v NetworkThrottlingIndex /t REG_DWORD /d 0xffffffff /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile" /v SystemResponsiveness /t REG_DWORD /d 0 /f
      # Priorizar jogos na rede
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v "GPU Priority" /t REG_DWORD /d 8 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Priority /t REG_DWORD /d 6 /f
      reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games" /v Scheduling Category /t REG_SZ /d High /f
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Rotas e perfis multimídia para jogos otimizados' };
  }
}

export default new NetworkEngine();
