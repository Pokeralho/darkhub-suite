@echo off
chcp 65001 > nul
cd /d "C:\Workspace\DarkHub Suite"

echo.
echo ===== ETAPA 2.1: Build C# (build:native) =====
call npm run build:native
if errorlevel 1 (
    echo ERRO em build:native
    pause
    exit /b 1
)

echo.
echo ===== ETAPA 2.2: Build Rust (build:pacer) =====
call npm run build:pacer
if errorlevel 1 (
    echo ERRO em build:pacer
    pause
    exit /b 1
)

echo.
echo ===== ETAPA 2.3: Build Completo (Vite + Electron) =====
call npm run build
if errorlevel 1 (
    echo ERRO em build
    pause
    exit /b 1
)

echo.
echo ===== ETAPA 3: Build Setup Inno =====
call npm run build:setup-inno
if errorlevel 1 (
    echo ERRO em build:setup-inno
    pause
    exit /b 1
)

echo.
echo ===== ✅ BUILD COMPLETO SUCESSO =====
echo Arquivos gerados em: dist_release\
dir dist_release\*.exe
echo.
pause
