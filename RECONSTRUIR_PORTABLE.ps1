$ErrorActionPreference = 'Stop'
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content -LiteralPath (Join-Path $folder 'SHA256SUMS.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.parts) {
    $file = Join-Path $folder $entry.name
    if (-not (Test-Path -LiteralPath $file)) { throw "Falta la parte: $($entry.name)" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Descarga incompleta o dañada: $($entry.name)" }
}
$target = Join-Path $folder $manifest.zip
if (Test-Path -LiteralPath $target) { throw "El ZIP ya existe: $target" }
$output = [IO.File]::Open($target, [IO.FileMode]::CreateNew)
try {
    foreach ($entry in $manifest.parts) {
        $inputStream = [IO.File]::OpenRead((Join-Path $folder $entry.name))
        try { $inputStream.CopyTo($output) } finally { $inputStream.Dispose() }
    }
} finally { $output.Dispose() }
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.sha256) { throw 'El ZIP reconstruido no supera la verificación.' }
Write-Host "ZIP reconstruido y verificado: $target" -ForegroundColor Green
Write-Host 'Extrae el ZIP completo y abre LQTAC Voice Studio Electron.exe dentro de la carpeta extraída.'
