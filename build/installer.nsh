!macro customInit
  ; Terminate any running instances of DarkHub or its services before file extraction
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.FrameLimiter.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.LatencyEngine.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "ReSwitch.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "LSEFree.exe" /T'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.FrameLimiter.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.LatencyEngine.exe" /T'
  Sleep 800
!macroend

!macro customInstall
  ; Optional components from their official releases (pinned SHA-256): PawnIO for the advanced sensors and ClamAV for
  ; real-time protection. Never fails the setup; whatever is skipped here the app installs later by itself.
  DetailPrint "Instalando componentes (PawnIO para sensores avancados e ClamAV antivirus)..."
  DetailPrint "Isso baixa cerca de 220 MB e pode levar alguns minutos."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\deps\install-deps.ps1"'
  Pop $0
  DetailPrint "Componentes: concluido (codigo $0). Registro em %ProgramData%\DarkHub\deps-install.log"
!macroend
