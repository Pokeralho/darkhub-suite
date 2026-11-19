# Build and release script for DarkHub Suite.
# "npm run build" already builds the C# helpers, the Rust engines, the vendored tools, the renderer, regenerates
# integrity.json and runs electron-builder (NSIS setup + portable, in dist_release/).
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "===== Build completo (nativos + Vite + Electron) =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO em build" -ForegroundColor Red; exit 1 }

Write-Host "`n===== BUILD COMPLETO =====" -ForegroundColor Green
Write-Host "Arquivos gerados em: dist_release/" -ForegroundColor Green
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
