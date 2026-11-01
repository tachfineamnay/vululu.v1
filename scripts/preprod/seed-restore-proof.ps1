#requires -Version 7.0
<#
.SYNOPSIS
    Cree un objet de preuve controle (octet + metadonnee ArtifactObject) pour le test de restauration.
.DESCRIPTION
    - ecrit un fichier PNG-like deterministe dans le bucket S3 local ;
    - insere une ligne ArtifactObject state=ready avec le SHA-256 exact ;
    - ne supprime rien et ne touche pas la demo.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$PgBin = 'D:/pgportable/pgsql/bin',
    [string]$Database = 'vululu_v1_00_test'
)
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
Set-Location -LiteralPath $rootPath
$bucket = Join-Path $rootPath 'infra/preprod/runtime/s3-data/vululu-artifacts'
$objectDir = Join-Path $bucket 'restore-proof'
New-Item -ItemType Directory -Force -Path $objectDir | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$content = 'vululu-restore-proof-' + $stamp + '-sha256-check'
$file = Join-Path $objectDir ('proof-' + $stamp + '.txt')
Set-Content -LiteralPath $file -Value $content -NoNewline -Encoding UTF8
$sha = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $file).Length
$key = 'restore-proof/proof-' + $stamp + '.txt'
$id = 'restore-proof-' + $stamp.ToLowerInvariant()
$psql = Join-Path $PgBin 'psql.exe'
$sql = 'INSERT INTO "ArtifactObject" (id, provider, key, "contentType", "sizeBytes", sha256, state, "createdAt", "updatedAt") VALUES (''' + $id + ''', ''s3'', ''' + $key + ''', ''text/plain'', ' + $size + ', ''' + $sha + ''', ''ready'', now(), now()) ON CONFLICT (provider, key) DO UPDATE SET sha256 = EXCLUDED.sha256, "sizeBytes" = EXCLUDED."sizeBytes", state = ''ready'''
& $psql -h 127.0.0.1 -p 55432 -U vululu -d $Database -c $sql | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Insertion ArtifactObject impossible.' }
Write-Output ('PROOF_OBJECT_READY key=' + $key + ' sha256=' + $sha + ' bytes=' + $size)
