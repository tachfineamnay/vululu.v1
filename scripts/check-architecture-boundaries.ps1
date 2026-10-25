#requires -Version 7.0
<#
.SYNOPSIS
    Controle statique des frontieres d'architecture Domain / Application.

.DESCRIPTION
    Regles verifiees (invariants AGENTS.md / ADR-0001, ADR-0006) :

    1. packages/domain/src :
       - uniquement des imports relatifs (aucun package externe, aucun builtin
         node, aucune dependance runtime) ;
       - confinement : un import relatif ne peut pas sortir de packages/domain/src ;
       - packages/domain/package.json sans bloc "dependencies".
       Miroir statique de tests/domain/purity.test.ts (execute aussi en CI).

    2. packages/application/src :
       - imports relatifs confines a packages/application/src ;
       - builtins node autorises sauf les modules d'I/O directs
         (fs, http, https, net, dgram, child_process, tls, dns, cluster,
         worker_threads) : l'Application Layer doit passer par des ports ;
       - packages workspace autorises : @vululu/domain, @vululu/contracts ;
       - refuse : apps/*, packages/db, @vululu/db, Prisma, Fastify, Next,
         AWS SDK, Hatchet, Postiz, sharp, tout autre package externe.

    Portabilite : PowerShell 7 Linux/Windows, aucun chemin absolu de machine.
    Code de sortie : 0 si les frontieres sont respectees, 1 sinon.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/). Permet de tester
    le controle sur un repertoire de test hors depot.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]

$workspaceAllowed = @('@vululu/domain', '@vululu/contracts')
$applicationForbiddenNodeBuiltins = @(
    'node:fs', 'node:fs/promises', 'node:http', 'node:http2', 'node:https',
    'node:net', 'node:dgram', 'node:child_process', 'node:tls', 'node:dns',
    'node:cluster', 'node:worker_threads', 'node:v8'
)

function Get-SourceFiles {
    param([string]$Directory)
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return @()
    }
    return @(Get-ChildItem -LiteralPath $Directory -Recurse -File -Filter '*.ts' | Sort-Object FullName)
}

function Get-ImportSpecifiers {
    param([string]$Path)
    $specifiers = New-Object System.Collections.Generic.List[object]
    $lineNumber = 0
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $lineNumber++
        $trimmed = $line.Trim()
        # Ignore les commentaires de ligne et de bloc simples (pas d'analyse AST).
        if ($trimmed.StartsWith('//') -or $trimmed.StartsWith('*') -or $trimmed.StartsWith('/*')) {
            continue
        }
        foreach ($match in [regex]::Matches($line, '(?:from\s*|import\s*\(\s*)[''"]([^''"]+)[''"]')) {
            $specifiers.Add([pscustomobject]@{
                Specifier = $match.Groups[1].Value
                Line      = $lineNumber
            })
        }
    }
    return $specifiers
}

function Get-PackageRelativePath {
    param([string]$BasePath, [string]$FullPath)
    return ([System.IO.Path]::GetRelativePath($BasePath, $FullPath)).Replace('\', '/')
}

# ---------------------------------------------------------------------------
# 1. Domain Core pur.
# ---------------------------------------------------------------------------
$domainDir = Join-Path $rootPath 'packages/domain'
$domainSrc = Join-Path $domainDir 'src'
$domainFiles = Get-SourceFiles -Directory $domainSrc
$domainImportCount = 0

if ($domainFiles.Count -lt 10) {
    $failures.Add('DOMAIN_SOURCE_FILES domain=' + $domainFiles.Count + ' (minimum 10)')
}

$domainPackageJson = Join-Path $domainDir 'package.json'
if (-not (Test-Path -LiteralPath $domainPackageJson -PathType Leaf)) {
    $failures.Add('MISSING packages/domain/package.json')
} else {
    $package = Get-Content -LiteralPath $domainPackageJson -Raw | ConvertFrom-Json
    $dependencyNames = @($package.dependencies.PSObject.Properties.Name | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($dependencyNames.Count -gt 0) {
        $failures.Add('DOMAIN_DEPENDENCIES interdites: ' + ($dependencyNames -join ','))
    }
}

foreach ($file in $domainFiles) {
    $relativeFile = Get-PackageRelativePath -BasePath $rootPath -FullPath $file.FullName
    foreach ($import in (Get-ImportSpecifiers -Path $file.FullName)) {
        $domainImportCount++
        $specifier = $import.Specifier
        if (-not ($specifier.StartsWith('./') -or $specifier.StartsWith('../'))) {
            $failures.Add('DOMAIN_EXTERNAL_IMPORT file=' + $relativeFile + ' line=' + $import.Line + ' specifier=' + $specifier)
            continue
        }
        $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $specifier))
        $relativeResolved = [System.IO.Path]::GetRelativePath($domainSrc, $resolved)
        if ($relativeResolved.StartsWith('..')) {
            $failures.Add('DOMAIN_IMPORT_ESCAPES_PACKAGE file=' + $relativeFile + ' line=' + $import.Line + ' specifier=' + $specifier)
        }
    }
}

# ---------------------------------------------------------------------------
# 2. Application Layer : pas d'acces direct aux apps ni aux SDK d'infrastructure.
# ---------------------------------------------------------------------------
$applicationSrc = Join-Path $rootPath 'packages/application/src'
$applicationFiles = Get-SourceFiles -Directory $applicationSrc
$applicationImportCount = 0

if ($applicationFiles.Count -lt 5) {
    $failures.Add('APPLICATION_SOURCE_FILES application=' + $applicationFiles.Count + ' (minimum 5)')
}

foreach ($file in $applicationFiles) {
    $relativeFile = Get-PackageRelativePath -BasePath $rootPath -FullPath $file.FullName
    foreach ($import in (Get-ImportSpecifiers -Path $file.FullName)) {
        $applicationImportCount++
        $specifier = $import.Specifier
        $location = ' file=' + $relativeFile + ' line=' + $import.Line + ' specifier=' + $specifier
        if ($specifier.StartsWith('./') -or $specifier.StartsWith('../')) {
            $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $specifier))
            $relativeResolved = [System.IO.Path]::GetRelativePath($applicationSrc, $resolved)
            if ($relativeResolved.StartsWith('..')) {
                $failures.Add('APPLICATION_IMPORT_ESCAPES_PACKAGE' + $location)
            }
            continue
        }
        if ($specifier.StartsWith('node:')) {
            if ($applicationForbiddenNodeBuiltins -contains $specifier) {
                $failures.Add('APPLICATION_FORBIDDEN_NODE_IO' + $location)
            }
            continue
        }
        if ($workspaceAllowed -contains $specifier) {
            continue
        }
        $failures.Add('APPLICATION_EXTERNAL_IMPORT' + $location)
    }
}

Write-Output ('DOMAIN_FILES=' + $domainFiles.Count)
Write-Output ('DOMAIN_IMPORTS=' + $domainImportCount)
Write-Output ('APPLICATION_FILES=' + $applicationFiles.Count)
Write-Output ('APPLICATION_IMPORTS=' + $applicationImportCount)

if ($failures.Count -gt 0) {
    Write-Output ('BOUNDARY_CHECK_FAIL: ' + $failures.Count + ' probleme(s).')
    foreach ($failure in $failures) {
        Write-Output ('FAIL ' + $failure)
    }
    exit 1
}

Write-Output 'BOUNDARY_CHECK_PASS: Domain Core pur et Application Layer sans import apps/SDK infra.'
exit 0
