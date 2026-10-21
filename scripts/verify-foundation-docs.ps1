#requires -Version 7.0
<#
.SYNOPSIS
    Verification documentaire et garde-fous de la Mission 00 Vululu AI.
.DESCRIPTION
    Verifie les empreintes des documents fondateurs, la presence des fichiers
    obligatoires, l'absence de fichiers sensibles et l'absence de structure
    applicative prematuree. Code de sortie : 0 si tout passe, 1 sinon.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]

$sumPath = Join-Path $rootPath 'docs/source/SHA256SUMS.txt'
if (-not (Test-Path -LiteralPath $sumPath)) {
    $failures.Add('MISSING docs/source/SHA256SUMS.txt')
} else {
    $lines = Get-Content -LiteralPath $sumPath
    $count = 0
    foreach ($line in $lines) {
        if ($line -match '^([0-9a-f]{64})  (.+)$') {
            $expected = $Matches[1]
            $relative = $Matches[2]
            $full = Join-Path $rootPath $relative
            if (-not (Test-Path -LiteralPath $full)) {
                $failures.Add('MISSING ' + $relative)
            } else {
                $actual = (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($actual -ne $expected) {
                    $failures.Add('HASH_MISMATCH ' + $relative)
                } else {
                    $count = $count + 1
                }
            }
        } elseif ($line.Trim().Length -gt 0) {
            $failures.Add('BAD_SUMS_LINE ' + $line)
        }
    }
    Write-Output ('HASHES_OK=' + $count)
}

$required = @(
    'README.md',
    'AGENTS.md',
    '.gitignore',
    '.gitattributes',
    '.env.example',
    'docs/README.md',
    'docs/INAUGURATION_REPORT.md',
    'docs/01_PRD_V1.md',
    'docs/02_CAHIER_DES_CHARGES_V1.md',
    'docs/03_ARCHITECTURE_V1.md',
    'docs/11_BACKLOG.md',
    'docs/PROMPT_DEEPSEEK_HARNESS.md',
    'docs/source/SHA256SUMS.txt',
    'docs/adr/README.md',
    'docs/adr/template.md',
    'docs/adr/0001-monolithe-modulaire-et-domain-core.md',
    'docs/adr/0002-postgresql-source-de-verite-et-s3.md',
    'docs/adr/0003-hatchet-port-orchestration-durable.md',
    'docs/adr/0004-mcp-meme-domaine-entree-differente.md',
    'docs/adr/0005-postiz-transfert-apres-approbation.md',
    'docs/backlog/ROADMAP_V1.md',
    'docs/backlog/P0_0_AUDIT_FONDATIONS.md',
    'docs/v2/README.md',
    'docs/v2/NOTE_SPECIALE_PROPOSITIONS_V2.md',
    'scripts/check-secrets.ps1',
    'scripts/verify-foundation-docs.ps1'
)
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $rootPath $relative))) {
        $failures.Add('MISSING ' + $relative)
    }
}

$forbiddenDirs = @('src', 'app', 'apps', 'packages')
foreach ($directory in $forbiddenDirs) {
    if (Test-Path -LiteralPath (Join-Path $rootPath $directory)) {
        $failures.Add('FORBIDDEN_APP_STRUCTURE ' + $directory)
    }
}

foreach ($sensitive in @('.env', 'node_modules')) {
    if (Test-Path -LiteralPath (Join-Path $rootPath $sensitive)) {
        $failures.Add('FORBIDDEN_LOCAL_ARTIFACT ' + $sensitive)
    }
}

$keyFiles = Get-ChildItem -LiteralPath $rootPath -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object {
    $relative = $_.FullName.Substring($rootPath.Length)
    if ($relative -match '[.]git') { return $false }
    if ($relative -match '_inbox') { return $false }
    return ($_.Extension.ToLowerInvariant() -in @('.pem', '.key', '.p12', '.pfx'))
}
foreach ($keyFile in $keyFiles) {
    $failures.Add('FORBIDDEN_KEY_FILE ' + $keyFile.FullName.Substring($rootPath.Length))
}

if ($failures.Count -gt 0) {
    Write-Output ('FOUNDATION_CHECK_FAIL: ' + $failures.Count + ' probleme(s).')
    foreach ($failure in $failures) { Write-Output ('FAIL ' + $failure) }
    exit 1
}

Write-Output 'FOUNDATION_CHECK_PASS: documents, structure et hygiene OK.'
exit 0
