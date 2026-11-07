#requires -Version 7.0
<#
.SYNOPSIS
    Genere la CA et le certificat TLS interne du S3 de preproduction.
.DESCRIPTION
    Utilise openssl fourni par Git for Windows. Ecrit dans
    infra/preprod/runtime/certs (ignore par Git). Ne remplace pas un certificat
    existant sans -Force. Aucune exposition publique.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
    [string]$OpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe',
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$certDir = Join-Path $rootPath 'infra/preprod/runtime/certs'
if ((Test-Path (Join-Path $certDir 'server.crt')) -and -not $Force) {
    Write-Output 'CERT_ALREADY_PRESENT'
    exit 0
}
if (-not (Test-Path -LiteralPath $OpenSsl)) { throw ('openssl introuvable: ' + $OpenSsl) }
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$caKey = Join-Path $certDir 'ca.key'
$caCrt = Join-Path $certDir 'ca.crt'
$serverKey = Join-Path $certDir 'server.key'
$serverCsr = Join-Path $certDir 'server.csr'
$serverCrt = Join-Path $certDir 'server.crt'
$san = Join-Path $certDir 'san.cnf'
Set-Content -LiteralPath $san -Value @('subjectAltName=DNS:s3,DNS:localhost,IP:127.0.0.1,IP:::1','basicConstraints=CA:FALSE','keyUsage=digitalSignature,keyEncipherment','extendedKeyUsage=serverAuth')
& $OpenSsl req -x509 -newkey rsa:2048 -nodes -keyout $caKey -out $caCrt -days 30 -subj '/CN=Vululu Preprod CA' 2>$null
& $OpenSsl req -newkey rsa:2048 -nodes -keyout $serverKey -out $serverCsr -subj '/CN=s3' 2>$null
& $OpenSsl x509 -req -in $serverCsr -CA $caCrt -CAkey $caKey -CAcreateserial -out $serverCrt -days 30 -sha256 -extfile $san 2>$null
& $OpenSsl verify -CAfile $caCrt $serverCrt | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Verification du certificat impossible.' }
Write-Output ('CERT_READY dir=' + $certDir)
