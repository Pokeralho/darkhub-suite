# Puts a trimmed, portable LibreOffice in vendor/libreoffice, which electron-builder ships inside the installer
# (extraResources -> resources/libreoffice). The File Converter uses it headless for Office documents, so users never
# need LibreOffice installed. It is fetched here, at build time only.
#   npm run build:libreoffice                    download the pinned MSI and verify it
#   ... -Msi D:\path\LibreOffice.msi             use an MSI already downloaded (still verified)
# Source: https://www.libreoffice.org (MPL-2.0; third-party notices in LICENSE.html / NOTICE, shipped alongside).
# The MSI is unpacked with an administrative install (msiexec /a: no system changes), then everything a headless
# converter does not need is removed: UI translations, help, extensions/dictionaries, Python, Java, Base/Firebird,
# icon themes, galleries and templates. Fonts (Liberation, Carlito, Caladea...) are kept: they are metric-compatible
# with Arial/Calibri/Cambria and keep page layout faithful.
# Keep SHA256 in sync with tests/converterVendor.test.ts.
param([string]$Msi = '', [string]$WorkRoot = '')
$ErrorActionPreference = 'Stop'

$Version = '26.2.7.3'
$Url = "https://downloadarchive.documentfoundation.org/libreoffice/old/$Version/win/x86_64/LibreOffice_${Version}_Win_x86-64.msi"
$Sha256 = '480FECF759FC6393BD614FBF43753EB95A8198FC1A065D41B727E3B664CD1E59'

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'vendor\libreoffice'
# The unpacked MSI is ~1.5 GB: work next to the project (D:) unless told otherwise, never in a full C: temp.
if (-not $WorkRoot) { $WorkRoot = Join-Path $root 'scratch' }
$work = Join-Path $WorkRoot ("dh-libreoffice-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
try {
  if (-not $Msi) {
    $Msi = Join-Path $work 'libreoffice.msi'
    Write-Host "Baixando $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Url -OutFile $Msi -UseBasicParsing
  }
  $hash = (Get-FileHash $Msi -Algorithm SHA256).Hash
  if ($hash -ne $Sha256) { throw "SHA-256 inesperado ($hash). Arquivo recusado." }

  $x = Join-Path $work 'x'
  $p = Start-Process msiexec.exe -ArgumentList @('/a', "`"$Msi`"", '/qn', "TARGETDIR=`"$x`"") -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "msiexec /a falhou ($($p.ExitCode))" }
  Get-ChildItem $x -Filter *.msi | Remove-Item -Force

  $keepLang = @('en-US', 'pt-BR')
  $rm = {
    param([string[]]$Paths)
    foreach ($q in $Paths) { Get-Item -Path (Join-Path $x $q) -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force }
  }
  & $rm @('help', 'readmes', 'CREDITS.fodt', 'update-settings.ini',
    'share\extensions', 'share\gallery', 'share\template', 'share\wizards', 'share\autotext', 'share\basic',
    'share\Scripts', 'share\firebird', 'share\tipoftheday', 'share\wordbook', 'share\glade', 'share\toolbarmode',
    'share\labels', 'share\classification', 'share\fingerprint',
    'program\python-core-*', 'program\python*.dll', 'program\python.exe', 'program\pythonw.exe', 'program\pyuno.pyd',
    'program\classes', 'program\wizards', 'program\Engine12.dll', 'program\fbclient.dll', 'program\ib_util.dll',
    'program\plugins', 'program\shlxthdl', 'program\opencl', 'program\sbase.exe', 'program\smath.exe',
    'program\quickstart.exe', 'program\unopkg*', 'program\*.ico')
  # icon themes: the headless converter draws no UI
  Get-ChildItem (Join-Path $x 'share\config') -Filter 'images_*.zip' | Remove-Item -Force
  # UI translations (built-in English is the fallback) and per-language registry layers
  Get-ChildItem (Join-Path $x 'program\resource') -Directory | Where-Object { $keepLang -notcontains $_.Name } | Remove-Item -Recurse -Force
  Get-ChildItem (Join-Path $x 'share\registry') -Recurse -File -Filter '*.xcd' | Where-Object {
    $_.Name -match '^(Langpack|registry|fcfg_langpack|lingucomponent)[-_](.+)\.xcd$' -and $keepLang -notcontains $Matches[2]
  } | Remove-Item -Force
  Get-ChildItem (Join-Path $x 'share\autocorr') -File | Where-Object { $_.Name -notmatch '(en-US|pt-BR)' } | Remove-Item -Force

  # Fonts the MSI would install into Windows: LibreOffice also loads them from share/fonts/truetype.
  $fontDir = Join-Path $x 'share\fonts\truetype'
  New-Item -ItemType Directory -Force $fontDir | Out-Null
  if (Test-Path (Join-Path $x 'Fonts')) { Move-Item (Join-Path $x 'Fonts\*') $fontDir -Force; Remove-Item (Join-Path $x 'Fonts') -Recurse -Force }
  # Windows already has Arial/Times/Calibri/Cambria and Arabic/Hebrew/Georgian faces; keep what documents created
  # elsewhere reference (Liberation = Arial/Times/Courier metrics, Carlito = Calibri, Caladea = Cambria, DejaVu, Noto).
  $keepFonts = '^(Liberation(Sans|Serif|Mono|SansNarrow)|Carlito|Caladea|DejaVu(Sans|Serif|SansMono)-|Noto(Sans|Serif)-|opens___)'
  Get-ChildItem $fontDir -File | Where-Object { $_.Name -notmatch $keepFonts } | Remove-Item -Force
  # VC++ runtime the MSI would install system-wide: app-local copy next to soffice.bin.
  if (Test-Path (Join-Path $x 'System64')) { Copy-Item (Join-Path $x 'System64\*.dll') (Join-Path $x 'program') -Force }
  & $rm @('System', 'System64')

  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Move-Item $x $dest
  Set-Content -Path (Join-Path $dest 'DARKHUB-VERSION.txt') -Value "LibreOffice $Version (trimmed headless build for DarkHub; MSI SHA-256 $Sha256)" -Encoding ascii
  $s = Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum
  Write-Host ("LibreOffice pronto em vendor\libreoffice ({0:N0} MB, {1} arquivos)." -f ($s.Sum / 1MB), $s.Count)
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
