@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22+ from https://nodejs.org/ first.
  pause
  exit /b 1
)
node scripts\bootstrap.cjs || (pause & exit /b 1)
if not exist "node_modules\electron\dist\electron.exe" (
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
call npm run pack:win
if errorlevel 1 (pause & exit /b 1)
rem npm run pack:win already stages all required hook installation files.
echo.
echo Build ready: release\HachiOrb-win32-x64\HachiOrb.exe
echo Copy the ENTIRE HachiOrb-win32-x64 folder when sharing.
pause
endlocal
