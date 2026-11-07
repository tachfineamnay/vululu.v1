#requires -Version 7.0
<#
.SYNOPSIS
    Prepare le binaire Hatchet embedded v0.110.5 pour l'image Docker de preproduction.
.DESCRIPTION
    Copie le binaire Linux amd64 depuis .v1/hatchet-embedded vers
    infra/preprod/build/ et verifie son SHA-256 contre la valeur connue.
    Ne telecharge rien, ne supprime rien.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$ExpectedSha256 = '18ddacae0005042bd982328bcb8d370cca6907352a1ab2a3c8406001d31e7dee'
)
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$source = Join-Path $rootPath '.v1/hatchet-embedded/hatchet-embedded-sidecar_v0.110.5_linux_amd64'
$targetDir = Join-Path $rootPath 'infra/preprod/build'
$target = Join-Path $targetDir 'hatchet-embedded-sidecar'
if (-not (Test-Path -LiteralPath $source)) {
    throw 'Sidecar absent: telecharger Hatchet v0.110.5 et verifier le SHA-256 (docs/execution/V1_01_C_OPERATIONS.md).'
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -LiteralPath $source -Destination $target -Force
$sha = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
if ($sha -ne $ExpectedSha256) {
    Remove-Item -LiteralPath $target -Force
    throw ('SHA-256 inattendu: ' + $sha)
}
Write-Output ('HATCHET_BINARY_READY sha256=' + $sha + ' bytes=' + (Get-Item -LiteralPath $target).Length)
