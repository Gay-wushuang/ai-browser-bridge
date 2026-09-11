@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules\.bin\tsup.cmd" (
  echo Installing project dependencies...
  call pnpm install
  if errorlevel 1 goto :failed
)

echo Building ai-browser-bridge...
call "node_modules\.bin\tsup.cmd"
if errorlevel 1 goto :failed

node "dist\bridge.js"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo ai-browser-bridge stopped with an error. Press any key to close.
pause >nul
exit /b 1
