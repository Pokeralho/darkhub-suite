@echo off
rem Builds the layer DLL with the Visual Studio Build Tools (CMake + Ninja + MSVC).
setlocal
set VSWHERE="%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
for /f "usebackq delims=" %%i in (`%VSWHERE% -latest -products * -property installationPath`) do set VSDIR=%%i
call "%VSDIR%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
cd /d "%~dp0"
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release || exit /b 1
cmake --build build || exit /b 1
if not exist "..\electron\services\lowlatency" mkdir "..\electron\services\lowlatency"
copy /y build\VkLayer_KORTHOS_LowLatency.dll ..\electron\services\lowlatency\ >nul || exit /b 1
copy /y build\VkLayer_KORTHOS_LowLatency.json ..\electron\services\lowlatency\ >nul || exit /b 1
copy /y LICENSE ..\electron\services\lowlatency\LICENSE.low_latency_layer.txt >nul
echo OK: electron\services\lowlatency\VkLayer_KORTHOS_LowLatency.dll
