#requires -Version 7.0
<#
.SYNOPSIS
    Demarre le serveur S3-compatible TLS de preproduction sur l'hote (Windows).
.DESCRIPTION
    rclone serve s3 v1.75.2, bucket vululu-artifacts, auth par cle, TLS interne.
    Ecoute uniquement 127.0.0.1:9443. Ne supprime rien.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$AccessKey = 'vululu',
    [string]$SecretKey = 'vululu-test-secret',
    [int]$Port = 9443
)
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$rclone = Join-Path $rootPath '.v1/rclone-s3/rclone.exe'
$dataDir = Join-Path $rootPath 'infra/preprod/runtime/s3-data'
$certDir = Join-Path $rootPath 'infra/preprod/runtime/certs'
if (-not (Test-Path -LiteralPath $rclone)) { throw 'rclone.exe absent.' }
if (-not (Test-Path (Join-Path $certDir 'server.crt'))) { throw 'Certificats absents: lancer scripts/preprod/gen-certs.ps1.' }
New-Item -ItemType Directory -Force -Path (Join-Path $dataDir 'vululu-artifacts') | Out-Null
& $rclone serve s3 $dataDir --addr ('127.0.0.1:' + $Port) --auth-key ($AccessKey + ',' + $SecretKey) --cert (Join-Path $certDir 'server.crt') --key (Join-Path $certDir 'server.key') --vfs-cache-mode writes --log-level INFO
