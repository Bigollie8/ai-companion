@echo off
title AI Companion
cd /d "%~dp0"
if not exist src-tauri\target\release\ai-companion.exe (
  call npm run build
  if errorlevel 1 (
    echo Building requires Node.js, Rust, and Microsoft C++ Build Tools.
    pause
    exit /b 1
  )
)
start "AI Companion" "%~dp0src-tauri\target\release\ai-companion.exe"
