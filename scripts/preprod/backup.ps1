#requires -Version 7.0
<#
.SYNOPSIS
    Sauvegarde non destructive de la base PostgreSQL et des objets S3-compatibles.
.DESCRIPTION
    - pg_dump -Fc de la base preprod/test vululu_v1_00_test (jamais la demo) ;
    - copie des objets du bucket local vers infra/preprod/backups/<timestamp>/s3 ;
    - manifeste JSON avec SHA-256 du dump, nombre/taille des objets, comptages SQL.
    Ne supprime rien, ne touche jamais vululu_v1_00.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$PgBin = 'D:/pgportable/pgsql/bin',
    [string]$SourceDb = 'vululu_v1_00_test',
    [string]$BucketDir = 'infra/preprod/runtime/s3-data/vululu-artifacts',
    [string]$BackupRoot = 'infra/preprod/backups'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
Set-Location -LiteralPath $rootPath

$rclone = Join-Path $rootPath '.v1/rclone-s3/rclone.exe'
$pgDump = Join-Path $PgBin 'pg_dump.exe'
$psql = Join-Path $PgBin 'psql.exe'
foreach ($tool in @($rclone, $pgDump, $psql)) {
    if (-not (Test-Path -LiteralPath $tool)) { throw ('Outil absent: ' + $tool) }
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupDir = Join-Path $rootPath (Join-Path $BackupRoot $stamp)
$s3BackupDir = Join-Path $backupDir 's3/vululu-artifacts'
New-Item -ItemType Directory -Force -Path $s3BackupDir | Out-Null

$dumpPath = Join-Path $backupDir 'vululu_preprod.dump'
& $pgDump -h 127.0.0.1 -p 55432 -U vululu -d $SourceDb -Fc -f $dumpPath
if ($LASTEXITCODE -ne 0) { throw 'pg_dump a echoue.' }

& $rclone copy (Join-Path $rootPath $BucketDir) $s3BackupDir --checksum --log-level ERROR
if ($LASTEXITCODE -ne 0) { throw 'rclone copy a echoue.' }

$tables = @('User', 'BrandContext', 'Project', 'Scene', 'SceneVersion', 'Artifact', 'ArtifactVersion', 'ArtifactObject', 'JobRun', 'StepRun', 'Approval', 'Transfer')
$counts = [ordered]@{}
foreach ($table in $tables) {
    $counts[$table] = [int](& $psql -h 127.0.0.1 -p 55432 -U vululu -d $SourceDb -tAc ('SELECT count(*) FROM "' + $table + '"')).Trim()
}

$objects = Get-ChildItem -LiteralPath $s3BackupDir -Recurse -File
$manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    sourceDatabase = $SourceDb
    sourceBucket = 'vululu-artifacts'
    dumpFile = 'vululu_preprod.dump'
    dumpSha256 = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
    dumpBytes = (Get-Item -LiteralPath $dumpPath).Length
    objectCount = $objects.Count
    objectBytes = ($objects | Measure-Object Length -Sum).Sum
    tableCounts = $counts
    rpoTarget = '24 h (sauvegarde quotidienne proposee)'
    rtoTarget = '2 h (restauration staging proposee)'
}
$manifestPath = Join-Path $backupDir 'manifest.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output ('BACKUP_PASS dir=' + $backupDir)
Write-Output ('DUMP_SHA256=' + $manifest.dumpSha256)
Write-Output ('OBJECTS=' + $objects.Count + ' BYTES=' + $manifest.objectBytes)
