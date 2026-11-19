@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
if exist "%~dp0LQTAC Voice Studio Electron.exe" (
  "%~dp0LQTAC Voice Studio Electron.exe" "%~dp0resources\app\mcp\server.cjs"
) else (
  node "%~dp0mcp\server.cjs"
)

