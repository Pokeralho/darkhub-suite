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
