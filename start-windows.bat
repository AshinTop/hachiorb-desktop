@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo [HachiOrb] Please install Node.js 22 or later from https://nodejs.org/
  echo Then double-click this file again.
  pause
  exit /b 1
)
node scripts\bootstrap.cjs
if errorlevel 1 (
  echo Original Grok Ball download/verification failed. Internet needed the first time.
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: downloading Electron desktop runtime, this can take a while.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo npm install failed. Check internet connection and run again.
    pause
    exit /b 1
  )
)
echo Launching HachiOrb...
call npm start
if errorlevel 1 pause
endlocal
