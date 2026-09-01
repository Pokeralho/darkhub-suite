import ElevationHelper from './ElevationHelper.js';

class VisualsEngine {
  async disableVisualEffects() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'

      # 1. Ajustar para Melhor Desempenho
      Set-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Type 'DWord' -Value 1 -Force
      reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9012038010000000 /f
      reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 0 /f
      reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 0 /f

      # 2. Desativar sombras, animacoes de menu, arrasto e transicoes
      $visualKeys = @(
        'ControlAnimations', 'AnimateMinMax', 'TaskbarAnimations', 'DWMAeroPeekEnabled',
        'MenuAnimation', 'TooltipAnimation', 'SelectionFade', 'DWMSaveThumbnailEnabled',
        'CursorShadow', 'ListviewShadow', 'ThumbnailsOrIcon', 'ListviewAlphaSelect',
        'DragFullWindows', 'ComboBoxAnimation', 'FontSmoothing', 'ListBoxSmoothScrolling', 'DropShadow'
      )
      foreach ($key in $visualKeys) {
        Set-ItemProperty -LiteralPath "Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects\\$key" -Name 'DefaultValue' -Value 1 -Type 'DWord' -Force
      }

      # 3. Reiniciar Explorer para aplicar mudancas imediatamente
      taskkill /f /im explorer.exe
      Start-Sleep -Milliseconds 300
      Start-Process explorer.exe
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Efeitos visuais desativados e Explorer reiniciado com sucesso' };
  }

  async revertVisualEffects() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      Set-ItemProperty -LiteralPath 'Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects' -Name 'VisualFXSetting' -Type 'DWord' -Value 0 -Force
      reg add "HKCU\\Control Panel\\Desktop" /v UserPreferencesMask /t REG_BINARY /d 9e3e078012000000 /f
      reg add "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v MinAnimate /t REG_SZ /d 1 /f
      reg add "HKCU\\Software\\Microsoft\\Windows\\DWM" /v EnableAeroPeek /t REG_DWORD /d 1 /f

      taskkill /f /im explorer.exe
      Start-Sleep -Milliseconds 300
      Start-Process explorer.exe
    `;
    const { code, stderr } = await ElevationHelper.runElevatedPowerShell(script);
    if (code !== 0) return { ok: false, error: stderr };
    return { ok: true, msg: 'Efeitos visuais restaurados para o Padrão do Windows' };
  }
}

export default new VisualsEngine();
