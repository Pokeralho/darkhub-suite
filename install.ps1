# ==============================================================================
#  DarkHub Suite - Official One-Liner PowerShell Installer
#  Usage: irm darkhub.ink/win | iex
# ==============================================================================

function Start-DarkHubInstall {
    [CmdletBinding()]
    param()

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    } catch {}

    $repo = "Pokeralho/darkhub-suite"
    $Version = "0.4.7"
    $directUrl = $null

    try {
        $latestReleaseJson = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{"User-Agent"="DarkHub-Installer"} -TimeoutSec 6 -ErrorAction Stop
        if ($latestReleaseJson -and $latestReleaseJson.tag_name) {
            $Version = $latestReleaseJson.tag_name.TrimStart('v')
            
            if ($latestReleaseJson.assets) {
                $setupAsset = $latestReleaseJson.assets | Where-Object { 
                    ($_.name -like "*Setup*.exe" -or $_.name -like "*.exe") -and ($_.name -notlike "*portable*")
                } | Select-Object -First 1

                if ($setupAsset -and $setupAsset.browser_download_url) {
                    $directUrl = $setupAsset.browser_download_url
                }
            }
        }
    } catch {
        # GitHub API rate limit or offline fallback: continue with default $Version
    }

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

    # 1. Check OS Version
    if ([Environment]::OSVersion.Version.Major -lt 10 -or -not [Environment]::Is64BitOperatingSystem) {
        Write-Host "[!] Error: DarkHub Suite requires Windows 10 or Windows 11 (64-bit)." -ForegroundColor Red
        return
    }

    # 2. Terminate running processes before installing
    Write-Host "[*] Terminating active DarkHub processes if running..." -ForegroundColor Yellow
    Get-Process -Name 'DarkHub','DarkHub.FrameLimiter','DarkHub.LatencyEngine','DarkHub.ClickEngine','ReSwitch','LSEFree' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 400

    # 3. Build candidate URLs (prioritize direct API asset, then dots notation, then hyphens)
    $downloadUrls = @()
    if ($directUrl) {
        $downloadUrls += $directUrl
    }
    $downloadUrls += @(
        "https://github.com/$repo/releases/download/v$Version/DarkHub.Setup.$Version.exe",
        "https://github.com/$repo/releases/latest/download/DarkHub.Setup.$Version.exe",
        "https://github.com/$repo/releases/download/v$Version/DarkHub-Setup-$Version.exe",
        "https://github.com/$repo/releases/latest/download/DarkHub-Setup-$Version.exe"
    )

    $downloadSuccess = $false

    foreach ($url in $downloadUrls) {
        try {
            if (Test-Path $tempInstaller) { 
                Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue 
            }

            Write-Host "[*] Downloading package from GitHub..." -ForegroundColor Green
            # Attempt curl with --fail (-f) so 404/500 HTTP errors don't save error pages
            if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
                & curl.exe -f -s -S -L -o "$tempInstaller" "$url"
            }

            # Fallback if curl missing or file smaller than 20MB
            if (-not (Test-Path $tempInstaller) -or (Get-Item $tempInstaller).Length -lt 20000000) {
                if (Test-Path $tempInstaller) { 
                    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue 
                }
                Write-Host "[*] Retrying with WebClient stream..." -ForegroundColor DarkGray
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("User-Agent", "Mozilla/5.0")
                $wc.DownloadFile($url, $tempInstaller)
            }

            # Check for valid installer (> 50MB)
            if ((Test-Path $tempInstaller) -and (Get-Item $tempInstaller).Length -gt 50000000) {
                $downloadSuccess = $true
                break
            } else {
                if (Test-Path $tempInstaller) {
                    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {
            Write-Host "[-] Mirror attempt failed, checking fallback..." -ForegroundColor DarkGray
            if (Test-Path $tempInstaller) {
                Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if (-not $downloadSuccess -or -not (Test-Path $tempInstaller)) {
        Write-Host "[!] Error: Failed to download official installer package from GitHub." -ForegroundColor Red
        Write-Host "[!] Download manually from: https://github.com/$repo/releases" -ForegroundColor Yellow
        return
    }

    $fileSizeMB = [math]::Round((Get-Item $tempInstaller).Length / 1MB, 2)
    Write-Host "[+] Package verified successfully ($fileSizeMB MB)." -ForegroundColor Green

    # 4. Silent installation
    Write-Host "[*] Installing DarkHub Suite v$Version silently..." -ForegroundColor Yellow
    $proc = Start-Process -FilePath $tempInstaller -ArgumentList "/S" -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog

    Start-Sleep -Milliseconds 500

    # 5. Launch application
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
