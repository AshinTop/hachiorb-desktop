@echo off
setlocal
chcp 65001 >nul 2>&1
echo HachiOrb local bridge smoke test (PowerShell, no Node required).
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0scripts\test-agent-connection.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %RESULT%
