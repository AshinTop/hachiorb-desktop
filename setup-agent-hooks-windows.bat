@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Please install Node.js 22 or newer.
 pause
 exit /b 1
)
node scripts\setup-integrations.cjs --all
echo.
echo Hooks are global to your current Windows user and will work while HachiOrb is running.
pause
endlocal
