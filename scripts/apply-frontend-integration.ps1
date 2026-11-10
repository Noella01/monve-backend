$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $backendRoot 'integration\lenos-v1'
$manifest = Get-Content -LiteralPath (Join-Path $backendRoot '.runtime\frontend-manifest.json') -Raw | ConvertFrom-Json
$destinationRoot = [System.IO.Path]::GetFullPath($manifest.destination).TrimEnd('\')
if ($destinationRoot -ne 'C:\Users\ccely\lenos-v1') { throw 'Unexpected frontend destination' }
# Validate every source and destination before writing any file.
foreach ($entry in $manifest.entries) {
  $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $stageRoot $entry.relative))
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $destinationRoot $entry.relative))
  if (-not $sourcePath.StartsWith($stageRoot + '\', [System.StringComparison]::OrdinalIgnoreCase) -or -not $targetPath.StartsWith($destinationRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe path in manifest' }
  if ((Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash -ne $entry.source_hash) { throw ('Staged file changed: ' + $entry.relative) }
  $actualHash = if (Test-Path -LiteralPath $targetPath) { (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash } else { $null }
  if ($actualHash -ne $entry.original_hash) { throw ('Frontend changed since preparation: ' + $entry.relative) }
}
$backupRoot = Join-Path $backendRoot ('.runtime\frontend-backup\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
foreach ($entry in $manifest.entries) {
  $sourcePath = Join-Path $stageRoot $entry.relative
  $targetPath = Join-Path $destinationRoot $entry.relative
  if (Test-Path -LiteralPath $targetPath) {
    $backupPath = Join-Path $backupRoot $entry.relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null
    Copy-Item -LiteralPath $targetPath -Destination $backupPath
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $targetPath) | Out-Null
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath
}
Write-Output ('Applied ' + $manifest.entries.Count + ' files to ' + $destinationRoot)
Write-Output ('Original files backed up at ' + $backupRoot)
