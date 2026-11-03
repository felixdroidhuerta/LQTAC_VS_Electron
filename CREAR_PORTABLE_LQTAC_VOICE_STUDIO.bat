@echo off
setlocal
cd /d "%~dp0"

echo Creando version portable de LQTAC Voice Studio Electron...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0BUILD_PORTABLE.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo La construccion termino con codigo %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo Version portable creada correctamente.
pause
exit /b 0
