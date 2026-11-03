@echo off
setlocal EnableExtensions

title LQTAC Voice Studio Electron
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"

echo ============================================================
echo   LQTAC Voice Studio Electron
echo ============================================================
echo.

if not exist "%APP_ROOT%package.json" (
    echo ERROR: No se encuentra package.json en:
    echo %APP_ROOT%
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if not errorlevel 1 (
    set "PNPM_CMD=pnpm"
) else (
    where corepack >nul 2>&1
    if not errorlevel 1 (
        set "PNPM_CMD=corepack pnpm"
    ) else (
        echo ERROR: No se encontro pnpm ni corepack.
        echo Instala Node.js y vuelve a ejecutar este archivo.
        pause
        exit /b 1
    )
)

if not exist "%APP_ROOT%node_modules\.bin\electron.cmd" (
    echo Preparando dependencias Electron...
    call %PNPM_CMD% install
    if errorlevel 1 (
        echo ERROR: No se pudieron instalar las dependencias.
        pause
        exit /b 1
    )
)

echo Arrancando LQTAC Voice Studio Electron...
call %PNPM_CMD% start
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo La aplicacion termino con codigo %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
