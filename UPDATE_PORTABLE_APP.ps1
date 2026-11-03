$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$documentsRoot = Split-Path -Parent $projectRoot
$portableRoot = if ($args.Count -gt 0) { [IO.Path]::GetFullPath($args[0]) } else { Join-Path $documentsRoot 'LQTAC_Voice_Studio_Electron_Portable_v0.1.0' }
$appRoot = Join-Path $portableRoot 'resources\app'

if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'main.cjs'))) {
    throw "No se encuentra una versión portable válida en: $portableRoot"
}

foreach ($file in @('main.cjs', 'preload.cjs', 'package.json')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $appRoot -Force
}
foreach ($directory in @('backend', 'src', 'assets')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $appRoot -Recurse -Force
}

$sttSource = Join-Path $projectRoot 'data\stt'
$sttTarget = Join-Path $portableRoot 'data\stt'
$fasterTarget = Join-Path $sttTarget 'faster\bin\lqtac-faster-whisper.exe'
if ((Test-Path -LiteralPath $sttSource) -and -not (Test-Path -LiteralPath $fasterTarget)) {
    New-Item -ItemType Directory -Path $sttTarget -Force | Out-Null
    Copy-Item -Path (Join-Path $sttSource '*') -Destination $sttTarget -Recurse -Force
    Write-Host 'Motores STT independientes copiados al portable.' -ForegroundColor Green
}
if (Test-Path -LiteralPath (Join-Path $projectRoot 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $portableRoot 'README.md') -Force
}

Write-Host "Aplicación portable actualizada en: $portableRoot" -ForegroundColor Green
Write-Host 'Los modelos y el runtime Python existentes se han conservado.'
