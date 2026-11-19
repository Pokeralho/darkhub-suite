; Every process that keeps files of $INSTDIR open: the app, its helpers, and the hosts that other programs start
; (VaultBridgeHost is kept open by Chrome/Edge, Mcp by Claude Desktop). Left running, they block updates/uninstall.
!macro DarkHubKillAll
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.FrameLimiter.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.LatencyEngine.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.ClickEngine.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.HotkeyWatch.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.HwSensors.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.SensorDaemon.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.DiskScan.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.DiskRescue.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.Cleaner.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.GpuBench.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.PacerInject.x86.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.VaultBridgeHost.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "DarkHub.Mcp.exe" /T'
!macroend

!macro customInit
  ; Terminate any running instances of DarkHub or its services before file extraction
  !insertmacro DarkHubKillAll
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "ReSwitch.exe" /T'
  nsExec::Exec 'cmd.exe /c taskkill /F /IM "LSEFree.exe" /T'
  Sleep 800
!macroend

!macro customUnInit
  !insertmacro DarkHubKillAll
  Sleep 800
!macroend

!macro customUnInstall
  ; Only on a real uninstall (an update also runs the old uninstaller): drop the Vulkan low-latency layer, which lives
  ; outside $INSTDIR so it survives updates (see electron/services/LowLatencyLayerService.js).
  ${ifNot} ${isUpdated}
    SetRegView 64
    DeleteRegValue HKLM "SOFTWARE\Khronos\Vulkan\ImplicitLayers" "$PROGRAMFILES64\DarkHubVkLayer\VkLayer_KORTHOS_LowLatency.json"
    SetRegView lastused
    RMDir /r "$PROGRAMFILES64\DarkHubVkLayer"
  ${endIf}
!macroend

!macro customInstall
  ; Optional component from its official release (pinned SHA-256): PawnIO for the advanced sensors. ClamAV is installed
  ; by the app only when real-time protection is turned on. Never fails the setup; the app retries whatever is skipped.
  DetailPrint "Instalando componentes (PawnIO para sensores avancados)..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\deps\install-deps.ps1"'
  Pop $0
  DetailPrint "Componentes: concluido (codigo $0). Registro em %ProgramData%\DarkHub\deps-install.log"
!macroend
