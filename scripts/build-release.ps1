# Build and Release Script for DarkHub Suite v0.4.8
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "===== ETAPA 2.1: Build C# (build:native) =====" -ForegroundColor Cyan
npm run build:native
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO em build:native" -ForegroundColor Red; exit 1 }

Write-Host "`n===== ETAPA 2.2: Build Rust (build:pacer) =====" -ForegroundColor Cyan
npm run build:pacer
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO em build:pacer" -ForegroundColor Red; exit 1 }

Write-Host "`n===== ETAPA 2.3: Build Completo (Vite + Electron) =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO em build" -ForegroundColor Red; exit 1 }

Write-Host "`n===== ETAPA 3: Build Setup Inno =====" -ForegroundColor Cyan
npm run build:setup-inno
if ($LASTEXITCODE -ne 0) { Write-Host "ERRO em build:setup-inno" -ForegroundColor Red; exit 1 }

Write-Host "`n===== ✅ BUILD COMPLETO SUCESSO =====" -ForegroundColor Green
Write-Host "Arquivos gerados em: dist_release/" -ForegroundColor Green
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Green
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
