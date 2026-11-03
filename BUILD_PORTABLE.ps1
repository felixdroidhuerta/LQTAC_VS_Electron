$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$documentsRoot = Split-Path -Parent $projectRoot
$sourceRoot = Join-Path $documentsRoot 'LQTAC_VS'
$portableRoot = $documentsRoot
$buildName = 'LQTAC_Voice_Studio_Electron_Portable_v0.1.0'
$outputRoot = Join-Path $portableRoot $buildName
$electronDist = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'node_modules\.pnpm') -Recurse -Filter 'electron.exe' -File |
    Where-Object { $_.FullName -like '*\node_modules\electron\dist\electron.exe' } |
    Select-Object -First 1 -ExpandProperty DirectoryName

if (-not (Test-Path -LiteralPath $sourceRoot)) {
    throw "No se encuentra el backend original en: $sourceRoot"
}
if (-not $electronDist) {
    throw 'No se encuentra el runtime de Electron. Ejecuta pnpm install primero.'
}
if (Test-Path -LiteralPath $outputRoot) {
    throw "La carpeta de salida ya existe. Bórrala o cambia buildName antes de repetir: $outputRoot"
}

New-Item -ItemType Directory -Path $outputRoot, (Join-Path $outputRoot 'resources\app'), (Join-Path $outputRoot 'resources\LQTAC_VS'), (Join-Path $outputRoot 'data\outputs') | Out-Null

Write-Host 'Copiando runtime Electron...'
Copy-Item -Path (Join-Path $electronDist '*') -Destination $outputRoot -Recurse -Force
$electronExe = Join-Path $outputRoot 'electron.exe'
$portableExe = Join-Path $outputRoot 'LQTAC Voice Studio Electron.exe'
Move-Item -LiteralPath $electronExe -Destination $portableExe

Write-Host 'Copiando aplicación Electron...'
$appFiles = @('main.cjs', 'preload.cjs', 'package.json')
foreach ($file in $appFiles) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $outputRoot 'resources\app') -Force }
foreach ($directory in @('backend', 'src', 'assets')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $outputRoot 'resources\app') -Recurse -Force
}

Write-Host 'Copiando runtime Python y modelos de Voice Studio...'
$portableSource = Join-Path $outputRoot 'resources\LQTAC_VS'
$excluded = @(
    (Join-Path $sourceRoot 'downloads'),
    (Join-Path $sourceRoot 'logs'),
    (Join-Path $sourceRoot 'installer_build'),
    (Join-Path $sourceRoot 'node_modules')
)
$robocopyArgs = @($sourceRoot, $portableSource, '/E', '/XJ', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD') + $excluded
& robocopy @robocopyArgs
if ($LASTEXITCODE -gt 7) { throw "Robocopy no pudo copiar el runtime de Voice Studio. Código: $LASTEXITCODE" }

$launcher = @'
@echo off
setlocal
cd /d "%~dp0"
start "LQTAC Voice Studio Electron" "%~dp0LQTAC Voice Studio Electron.exe"
exit /b 0
'@
Set-Content -LiteralPath (Join-Path $outputRoot 'INICIAR_LQTAC_VOICE_STUDIO.bat') -Value $launcher -Encoding ASCII

$readme = @'
LQTAC Voice Studio Electron - versión portable

Ejecuta INICIAR_LQTAC_VOICE_STUDIO.bat o LQTAC Voice Studio Electron.exe.
No requiere instalar Electron, Python ni dependencias en Windows.
Mantén esta carpeta completa para conservar los motores y modelos locales.
'@
Set-Content -LiteralPath (Join-Path $outputRoot 'README_PORTABLE.txt') -Value $readme -Encoding UTF8

Write-Host ''
Write-Host "Versión portable creada en: $outputRoot" -ForegroundColor Green
Write-Host 'Puedes copiar la carpeta completa a otro directorio o unidad.'
