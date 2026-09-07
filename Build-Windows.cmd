@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS is required. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
call npm.cmd test
if errorlevel 1 goto failed
call npm.cmd run build:win
if errorlevel 1 goto failed
echo.
echo Build finished. Open the dist folder for Seaton-Setup and Seaton-Portable.
start "" "%~dp0dist"
pause
exit /b 0
:failed
echo.
echo Build failed. Please copy the error message above.
pause
exit /b 1
