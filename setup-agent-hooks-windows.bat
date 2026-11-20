@echo off
setlocal EnableExtensions
cd /d "%~dp0"
chcp 65001 >nul 2>&1
echo ===============================================
echo HachiOrb - Codex / Cursor / WorkBuddy Hooks Setup
echo ===============================================
echo Existing Codex notify will be backed up and preserved.
echo.
where node.exe >nul 2>&1
if errorlevel 1 goto fallback
echo [INFO] Using Node.js composite notification installer.
node scripts\setup-integrations.cjs --all
goto done
:fallback
echo [INFO] Node.js not found. Using Windows PowerShell fallback.
where powershell.exe >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Neither Node.js nor Windows PowerShell was found.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\setup-agent-hooks.ps1"
:done
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo [ERROR] One or more hooks were not installed. Read the error above.
) else (
  echo [OK] Hooks configured. Restart Codex / Cursor and fully exit + restart WorkBuddy, then test.
)
echo.
pause
exit /b %RESULT%
