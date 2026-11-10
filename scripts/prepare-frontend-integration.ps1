param([string]$Destination = 'C:\Users\ccely\lenos-v1')
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $backendRoot 'integration\lenos-v1'
$destinationRoot = [System.IO.Path]::GetFullPath($Destination).TrimEnd('\')
$sources = @((Get-ChildItem -LiteralPath (Join-Path $stageRoot 'frontend\src') -Recurse -File).FullName)
$sources += Join-Path $stageRoot 'shared\types.ts'
$sources += Join-Path $stageRoot '.env.local'
$sources += Join-Path $stageRoot 'docs\backend-integration.md'
$entries = @()
foreach ($sourcePath in $sources) {
  $relative = [System.IO.Path]::GetRelativePath($stageRoot, $sourcePath)
  $targetPath = [System.IO.Path]::GetFullPath((Join-Path $destinationRoot $relative))
  if (-not $targetPath.StartsWith($destinationRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid destination path' }
  if ($relative -eq '.env.local' -and (Test-Path -LiteralPath $targetPath)) {
    Write-Output 'Existing frontend .env.local preserved. Configure VITE_API_BASE_URL separately.'
    continue
  }
  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
  $oldHash = if (Test-Path -LiteralPath $targetPath) { (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash } else { $null }
  if ($sourceHash -ne $oldHash) { $entries += [pscustomobject]@{ relative = $relative; source_hash = $sourceHash; original_hash = $oldHash } }
}
New-Item -ItemType Directory -Force -Path (Join-Path $backendRoot '.runtime') | Out-Null
$manifest = [pscustomobject]@{ destination = $destinationRoot; entries = $entries }
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backendRoot '.runtime\frontend-manifest.json') -Encoding utf8
$entries | Select-Object relative
Write-Output ('Prepared ' + $entries.Count + ' changed/new files. No destination files written.')
