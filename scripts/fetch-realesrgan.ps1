# Puts the Real-ESRGAN AI upscaler in vendor/realesrgan, which electron-builder ships inside the installer
# (extraResources -> resources/realesrgan). Users never download it: it is fetched here, at build time only.
#   npm run build:upscaler                      download the pinned release and verify it
#   ... -Zip C:\path\realesrgan.zip             use a zip already downloaded (still verified)
# Source: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0 (BSD-3 / MIT, ncnn BSD-3; texts in licenses/realesrgan).
# Keep SHA256 in sync with tests/aiUpscaler.test.ts.
param([string]$Zip = '')
$ErrorActionPreference = 'Stop'

$Url = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip'
$Sha256 = 'ABC02804E17982A3BE33675E4D471E91EA374E65B70167ABC09E31ACB412802D'
# Only what DarkHub uses: the CLI, its OpenMP runtime, the two best models (realistic, stylised) and the compact fast
# model at 2x and 4x.
$Keep = @(
  'realesrgan-ncnn-vulkan.exe', 'vcomp140.dll',
  'models/realesrgan-x4plus.bin', 'models/realesrgan-x4plus.param',
  'models/realesrgan-x4plus-anime.bin', 'models/realesrgan-x4plus-anime.param',
  'models/realesr-animevideov3-x2.bin', 'models/realesr-animevideov3-x2.param',
  'models/realesr-animevideov3-x4.bin', 'models/realesr-animevideov3-x4.param'
)

$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root 'vendor\realesrgan'
$work = Join-Path ([IO.Path]::GetTempPath()) ("dh-realesrgan-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
try {
  if (-not $Zip) {
    $Zip = Join-Path $work 'realesrgan.zip'
    Write-Host "Baixando $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
  }
  $hash = (Get-FileHash $Zip -Algorithm SHA256).Hash
  if ($hash -ne $Sha256) { throw "SHA-256 inesperado ($hash). Arquivo recusado." }
  $x = Join-Path $work 'x'
  Expand-Archive $Zip -DestinationPath $x -Force
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force (Join-Path $dest 'models') | Out-Null
  foreach ($f in $Keep) {
    $src = Join-Path $x $f
    if (-not (Test-Path $src)) { throw "Faltando no pacote: $f" }
    Copy-Item $src (Join-Path $dest $f)
  }
  Copy-Item (Join-Path $root 'licenses\realesrgan\LICENSE-*.txt') $dest
  $mb = [math]::Round(((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
  Write-Host "Real-ESRGAN pronto em vendor\realesrgan ($mb MB)."
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
