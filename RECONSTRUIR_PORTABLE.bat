@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RECONSTRUIR_PORTABLE.ps1"
pause
