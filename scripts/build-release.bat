@echo off
chcp 65001 > nul
cd /d "%~dp0.."

rem "npm run build" already builds the C# helpers, the Rust engines, the vendored tools, the renderer, regenerates
rem integrity.json and runs electron-builder (NSIS setup + portable, in dist_release\).
echo.
echo ===== Build completo (nativos + Vite + Electron) =====
call npm run build
if errorlevel 1 (
    echo ERRO em build
    pause
    exit /b 1
)

echo.
echo ===== BUILD COMPLETO =====
echo Arquivos gerados em: dist_release\
dir dist_release\*.exe
echo.
pause
