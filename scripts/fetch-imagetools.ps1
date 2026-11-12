# Puts the File Converter's image helpers in vendor/imagetools, which electron-builder ships inside the installer
# (extraResources -> resources/imagetools). Users never download them: they are fetched here, at build time only.
#   npm run build:imagetools
#   ... -TexconvExe C:\path\texconv.exe -LibRawZip C:\path\LibRaw-Win64.zip    use files already downloaded (still verified)
# texconv: https://github.com/microsoft/DirectXTex/releases/tag/may2026 (MIT) - DDS read/write, BC1-BC7, mipmaps.
# LibRaw:  https://www.libraw.org/download 0.22.0 (LGPL-2.1 or CDDL-1.0) - camera RAW development (dcraw_emu).
# Keep the SHA-256 values in sync with tests/converterVendor.test.ts.
param([string]$TexconvExe = '', [string]$LibRawZip = '')
$ErrorActionPreference = 'Stop'

$TexconvUrl = 'https://github.com/microsoft/DirectXTex/releases/download/may2026/texconv.exe'
$TexconvSha256 = 'DCFDEC10244E02CF5037FBA089C55FB7E1326B1C8181742D77D15FA5CB5EEF06'
$LibRawUrl = 'https://www.libraw.org/data/LibRaw-0.22.0-Win64.zip'
$LibRawSha256 = '1B65EE99C70BA5DDA40D17CE534EDDC6977E09A9D8763AF1E5A75DF541FCF0D8'

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'vendor\imagetools'
$work = Join-Path ([IO.Path]::GetTempPath()) ("dh-imagetools-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  if (-not $TexconvExe) { $TexconvExe = Join-Path $work 'texconv.exe'; Write-Host "Baixando $TexconvUrl"; Invoke-WebRequest -Uri $TexconvUrl -OutFile $TexconvExe -UseBasicParsing }
  if (-not $LibRawZip) { $LibRawZip = Join-Path $work 'libraw.zip'; Write-Host "Baixando $LibRawUrl"; Invoke-WebRequest -Uri $LibRawUrl -OutFile $LibRawZip -UseBasicParsing }
  $h = (Get-FileHash $TexconvExe -Algorithm SHA256).Hash
  if ($h -ne $TexconvSha256) { throw "SHA-256 inesperado para texconv ($h). Arquivo recusado." }
  $h = (Get-FileHash $LibRawZip -Algorithm SHA256).Hash
  if ($h -ne $LibRawSha256) { throw "SHA-256 inesperado para LibRaw ($h). Arquivo recusado." }

  $x = Join-Path $work 'x'
  Expand-Archive $LibRawZip -DestinationPath $x -Force
  $lr = Get-ChildItem $x -Directory | Select-Object -First 1
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item $TexconvExe (Join-Path $dest 'texconv.exe')
  foreach ($f in @('bin\dcraw_emu.exe', 'bin\libraw.dll')) {
    $src = Join-Path $lr.FullName $f
    if (-not (Test-Path $src)) { throw "Faltando no pacote LibRaw: $f" }
    Copy-Item $src $dest
  }
  foreach ($f in @('LICENSE.LGPL', 'LICENSE.CDDL', 'COPYRIGHT')) {
    $src = Join-Path $lr.FullName $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $dest "LibRaw-$f.txt") }
  }
  Copy-Item (Join-Path $root 'licenses\imagetools\*.txt') $dest -ErrorAction SilentlyContinue
  $kb = [math]::Round(((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1KB))
  Write-Host "Ferramentas de imagem prontas em vendor\imagetools ($kb KB)."
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
