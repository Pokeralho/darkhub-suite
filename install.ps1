function Start-DarkHubInstall {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    } catch {}

    $repo = "Pokeralho/darkhub-suite"
    $Version = "0.4.6"
    try {
        $latestReleaseJson = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{"User-Agent"="DarkHub-Installer"} -TimeoutSec 5 -ErrorAction Stop
        if ($latestReleaseJson.tag_name) {
            $Version = $latestReleaseJson.tag_name.TrimStart('v')
        }
    } catch {}

    $tempDir = [System.IO.Path]::GetTempPath()
    $tempInstaller = Join-Path $tempDir "DarkHub.Setup.$Version.exe"
    $outLog = Join-Path $tempDir "darkhub_install_out.log"
    $errLog = Join-Path $tempDir "darkhub_install_err.log"

    Clear-Host
    Write-Host @"
  ===================================================================
    DarkHub Suite - Windows System Optimization & Security Suite
    Official Release: v$Version | Platform: Windows 10/11 x64
  ===================================================================
"@ -ForegroundColor Cyan
    Write-Host ""

    if ([Environment]::OSVersion.Version.Major -lt 10 -or -not [Environment]::Is64BitOperatingSystem) {
        Write-Host "[!] Error: DarkHub Suite requires Windows 10 or Windows 11 (64-bit)." -ForegroundColor Red
        return
    }

    Write-Host "[*] Terminating active DarkHub processes if running..." -ForegroundColor Yellow
    Get-Process -Name 'DarkHub','DarkHub.FrameLimiter','DarkHub.LatencyEngine','DarkHub.ClickEngine','ReSwitch','LSEFree' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300

    Write-Host "[*] Downloading official installer from GitHub..." -ForegroundColor Yellow
    $downloadUrls = @(
        "https://github.com/$repo/releases/download/v$Version/DarkHub-Setup-$Version.exe",
        "https://github.com/$repo/releases/download/v$Version/DarkHub.Setup.$Version.exe",
        "https://github.com/$repo/releases/latest/download/DarkHub-Setup-$Version.exe",
        "https://github.com/$repo/releases/latest/download/DarkHub.Setup.$Version.exe"
    )

    $downloadSuccess = $false

    foreach ($url in $downloadUrls) {
        try {
            if (Test-Path $tempInstaller) { Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue }

            if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
                Write-Host "[*] Downloading package from GitHub..." -ForegroundColor Green
                & curl.exe -L -o "$tempInstaller" "$url"
            }
            
            if (-not (Test-Path $tempInstaller) -or (Get-Item $tempInstaller).Length -lt 10000000) {
                Write-Host "[*] Retrying with WebClient stream..." -ForegroundColor DarkGray
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("User-Agent", "Mozilla/5.0")
                $wc.DownloadFile($url, $tempInstaller)
            }

            if ((Test-Path $tempInstaller) -and (Get-Item $tempInstaller).Length -gt 100000000) {
                $downloadSuccess = $true
                break
            }
        } catch {
            Write-Host "[-] Mirror failed ($url), checking fallback..." -ForegroundColor DarkGray
        }
    }

    if (-not $downloadSuccess -or -not (Test-Path $tempInstaller)) {
        Write-Host "[!] Error: Failed to download official installer package." -ForegroundColor Red
        Write-Host "[!] Please download manually from: https://github.com/$repo/releases" -ForegroundColor Yellow
        return
    }

    Write-Host "[*] Installing DarkHub Suite silently..." -ForegroundColor Yellow
    Start-Process -FilePath $tempInstaller -ArgumentList "/S" -WindowStyle Hidden -Wait -RedirectStandardOutput $outLog -RedirectStandardError $errLog

    $possiblePaths = @(
        "$env:LOCALAPPDATA\Programs\DarkHub\DarkHub.exe",
        "$env:ProgramFiles\DarkHub\DarkHub.exe",
        "$env:ProgramFiles(x86)\DarkHub\DarkHub.exe"
    )

    $appLaunched = $false
    foreach ($appPath in $possiblePaths) {
        if (Test-Path $appPath) {
            try {
                Start-Process -FilePath "explorer.exe" -ArgumentList "`"$appPath`""
                $appLaunched = $true
            } catch {
                try {
                    Start-Process -FilePath $appPath -WorkingDirectory (Split-Path $appPath)
                    $appLaunched = $true
                } catch {}
            }
            break
        }
    }

    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor DarkGray
    Write-Host " [OK] DarkHub Suite v$Version installed successfully!" -ForegroundColor Cyan
    if ($appLaunched) {
        Write-Host " [OK] Application launched and shortcuts created on Desktop." -ForegroundColor White
    } else {
        Write-Host " [OK] Shortcuts created on Desktop and Start Menu." -ForegroundColor White
    }
    Write-Host " [*] Installation complete." -ForegroundColor DarkGray
    Write-Host "===================================================================" -ForegroundColor DarkGray
    Write-Host ""

    try { Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item $outLog -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item $errLog -Force -ErrorAction SilentlyContinue } catch {}

    Start-Sleep -Milliseconds 400
}

Start-DarkHubInstall
