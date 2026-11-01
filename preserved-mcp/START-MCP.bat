@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist runtime\node.exe (
 runtime\node.exe server.mjs
 pause
 exit /b
)
where node >nul 2>nul
if errorlevel 1 (
 echo 请先安装 Node.js 22.12 或更高版本：https://nodejs.org/
 pause
 exit /b 1
)
if not exist node_modules\@modelcontextprotocol\sdk\package.json (
 call npm ci --omit=dev --no-audit --no-fund
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
node server.mjs
pause
