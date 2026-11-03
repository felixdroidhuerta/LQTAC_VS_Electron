@echo off
setlocal
cd /d "%~dp0"

echo Actualizando la aplicacion Electron portable...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE_PORTABLE_APP.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo La actualizacion termino con codigo %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo Portable actualizado sin volver a copiar los modelos.
pause
exit /b 0
