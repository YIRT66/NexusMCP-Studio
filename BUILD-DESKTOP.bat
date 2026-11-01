@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "npm_config_cache=%~dp0.cache\npm"
set "ELECTRON_BUILDER_CACHE=%~dp0.cache\electron-builder"
set "TEMP=%~dp0.cache\tmp"
set "TMP=%~dp0.cache\tmp"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"
if not exist "%TEMP%" mkdir "%TEMP%"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 22.12 or newer, then try again.
 pause
 exit /b 1
)
if not exist node_modules\electron-builder\package.json (
 call npm ci --no-audit --no-fund
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
if not exist node_modules\electron\dist\electron.exe (
 call node node_modules\electron\install.js
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
call npm run dist
if errorlevel 1 (
 pause
 exit /b 1
)
echo Desktop executable is ready in the release folder.
pause
