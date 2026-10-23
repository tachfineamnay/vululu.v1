param(
  [string]$DatabaseUrl = $env:V1_DATABASE_URL,
  [string]$ArtifactRoot = '',
  [string]$OutputJson = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
  $ArtifactRoot = Join-Path $repoRoot 'data/artifacts'
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'DatabaseUrl requis (ou V1_DATABASE_URL).'
}
$dbUrl = $DatabaseUrl -replace '\?schema=.*$', ''
$psql = Join-Path 'D:/pgportable/pgsql/bin' 'psql.exe'
if (-not (Test-Path -LiteralPath $psql)) {
  $psql = (Get-Command psql.exe -ErrorAction SilentlyContinue).Source
}
if (-not $psql) {
  throw 'psql.exe introuvable.'
}
$rootPath = (Resolve-Path -LiteralPath $ArtifactRoot).Path
$query = @'
COPY (
  SELECT 'scene' AS kind, sv."imagePath" AS path FROM "SceneVersion" sv
  UNION ALL
  SELECT 'master' AS kind, av."masterPath" AS path FROM "ArtifactVersion" av
) TO STDOUT WITH (FORMAT csv);
'@
$rows = & $psql $dbUrl -At -c $query 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'Lecture des chemins DB impossible.'
}
$dbPaths = New-Object System.Collections.Generic.HashSet[string]
$dbRows = @()
foreach ($row in $rows) {
  if ([string]::IsNullOrWhiteSpace($row)) { continue }
  $parts = $row -split ','
  if ($parts.Count -lt 2) { continue }
  $kind = $parts[0].Trim('"')
  $relative = ($parts[1] -replace '^"|"$','').Trim()
  [void]$dbPaths.Add($relative)
  $dbRows += [pscustomobject]@{ kind = $kind; path = $relative }
}
$missing = @()
foreach ($row in $dbRows) {
  $absolute = Join-Path $rootPath ($row.path -replace '/', [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $absolute)) {
    $missing += $row.path
  }
}
$files = Get-ChildItem -LiteralPath $rootPath -Recurse -File -ErrorAction SilentlyContinue
$orphans = @()
foreach ($file in $files) {
  $relative = [IO.Path]::GetRelativePath($rootPath, $file.FullName) -replace '\\','/'
  if (-not $dbPaths.Contains($relative)) {
    $orphans += $relative
  }
}
$report = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  artifactRoot = $rootPath
  dbPaths = $dbRows.Count
  files = $files.Count
  missingFiles = $missing.Count
  orphanFiles = $orphans.Count
  missing = $missing
  orphans = $orphans
}
$json = $report | ConvertTo-Json -Depth 4
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
  $json
} else {
  $json | Set-Content -LiteralPath $OutputJson -Encoding utf8
  Write-Output ('ARTIFACT_AUDIT_REPORT=' + (Resolve-Path -LiteralPath $OutputJson).Path)
}
if ($missing.Count -gt 0) {
  Write-Output ('ARTIFACT_AUDIT_MISSING=' + $missing.Count)
  exit 2
}
Write-Output ('ARTIFACT_AUDIT_OK db=' + $dbRows.Count + ' files=' + $files.Count + ' orphans=' + $orphans.Count), ''
