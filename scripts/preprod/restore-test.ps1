#requires -Version 7.0
<#
.SYNOPSIS
    Test de restauration isole PostgreSQL + objets S3 a partir de la derniere sauvegarde.
.DESCRIPTION
    - restaure le dump dans une NOUVELLE base vululu_restore_<timestamp> ;
    - copie les objets dans un NOUVEAU bucket local de restauration ;
    - verifie les comptages SQL, le nombre/taille des objets et les SHA-256 ;
    - verifie qu'un ArtifactObject ready correspond bien a un fichier restaure.
    Ne modifie ni la base source, ni la demo, ni le bucket source.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$PgBin = 'D:/pgportable/pgsql/bin',
    [string]$BackupRoot = 'infra/preprod/backups',
    [string]$RestoreRoot = 'infra/preprod/runtime/restore'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
Set-Location -LiteralPath $rootPath

$rclone = Join-Path $rootPath '.v1/rclone-s3/rclone.exe'
$psql = Join-Path $PgBin 'psql.exe'
$pgRestore = Join-Path $PgBin 'pg_restore.exe'

$latest = Get-ChildItem -LiteralPath (Join-Path $rootPath $BackupRoot) -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $latest) { throw 'Aucune sauvegarde trouvee.' }
$manifest = Get-Content -LiteralPath (Join-Path $latest.FullName 'manifest.json') -Raw | ConvertFrom-Json
$dumpPath = Join-Path $latest.FullName $manifest.dumpFile
$s3BackupDir = Join-Path $latest.FullName 's3/vululu-artifacts'

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$targetDb = 'vululu_restore_' + $stamp.ToLowerInvariant()
$targetRoot = Join-Path $rootPath (Join-Path $RestoreRoot $stamp)
$targetBucket = Join-Path $targetRoot 'vululu-artifacts'
New-Item -ItemType Directory -Force -Path $targetBucket | Out-Null

& $psql -h 127.0.0.1 -p 55432 -U vululu -d postgres -c ('CREATE DATABASE "' + $targetDb + '"') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Creation de la base de restauration impossible.' }
& $pgRestore -h 127.0.0.1 -p 55432 -U vululu -d $targetDb --no-owner --no-privileges $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'pg_restore a echoue.' }
& $rclone copy $s3BackupDir $targetBucket --checksum --log-level ERROR
if ($LASTEXITCODE -ne 0) { throw 'copie des objets de restauration impossible.' }

$failures = New-Object System.Collections.Generic.List[string]
foreach ($table in $manifest.tableCounts.PSObject.Properties.Name) {
    $source = [int]$manifest.tableCounts.$table
    $restored = [int](& $psql -h 127.0.0.1 -p 55432 -U vululu -d $targetDb -tAc ('SELECT count(*) FROM "' + $table + '"')).Trim()
    if ($source -ne $restored) { $failures.Add('COUNT ' + $table + ' ' + $source + ' != ' + $restored) }
}

function Get-Hashes([string]$BaseDir) {
    $map = @{}
    Get-ChildItem -LiteralPath $BaseDir -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($BaseDir.Length).TrimStart([char]92, [char]47)
        $map[$relative] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $map
}

$backupHashes = Get-Hashes $s3BackupDir
$restoreHashes = Get-Hashes $targetBucket
if ($backupHashes.Count -ne $restoreHashes.Count) {
    $failures.Add('OBJECT_COUNT ' + $backupHashes.Count + ' != ' + $restoreHashes.Count)
}
foreach ($key in $backupHashes.Keys) {
    if (-not $restoreHashes.ContainsKey($key)) { $failures.Add('OBJECT_MISSING ' + $key); continue }
    if ($backupHashes[$key] -ne $restoreHashes[$key]) { $failures.Add('OBJECT_SHA ' + $key) }
}

$rows = & $psql -h 127.0.0.1 -p 55432 -U vululu -d $targetDb -tAc 'SELECT key || ''|'' || sha256 FROM "ArtifactObject" WHERE state = ''ready'' ORDER BY "createdAt" DESC LIMIT 500'
$verifiedObjects = 0
foreach ($row in @($rows)) {
    if ([string]::IsNullOrWhiteSpace($row)) { continue }
    $parts = $row.Trim().Split('|')
    if ($parts.Count -lt 2) { continue }
    $objectFile = Join-Path $targetBucket $parts[0]
    if (-not (Test-Path -LiteralPath $objectFile)) { continue }
    $actual = (Get-FileHash -LiteralPath $objectFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $parts[1]) { $failures.Add('OBJECT_METADATA_SHA ' + $parts[0]); continue }
    $verifiedObjects += 1
}
if ($verifiedObjects -eq 0) { $failures.Add('NO_RESTORED_OBJECT_MATCHES_METADATA') }

$report = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    backup = $latest.Name
    targetDatabase = $targetDb
    targetBucket = $targetRoot
    objectCount = $restoreHashes.Count
    verifiedObjects = $verifiedObjects
    failures = @($failures)
    verdict = if ($failures.Count -eq 0) { 'RESTORE_PASS' } else { 'RESTORE_FAIL' }
    rpoTarget = $manifest.rpoTarget
    rtoTarget = $manifest.rtoTarget
}
$reportPath = Join-Path $targetRoot 'restore-report.json'
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output ($report.verdict + ' db=' + $targetDb + ' objects=' + $restoreHashes.Count + ' report=' + $reportPath)
if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Output ('FAIL ' + $_) }
    exit 1
}
exit 0
