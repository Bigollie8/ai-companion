@echo off
title AI Companion
cd /d "%~dp0"
if not exist node_modules\electron\dist\electron.exe (
  echo Install Node.js 22 or later, then run npm ci in this folder first.
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=
start "AI Companion" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
