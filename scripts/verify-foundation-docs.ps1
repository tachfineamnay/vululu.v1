#requires -Version 7.0
<#
.SYNOPSIS
    Verification documentaire et garde-fous de la Mission 00 Vululu AI.
.DESCRIPTION
    Verifie les empreintes des documents fondateurs, la presence des fichiers
    obligatoires du socle et des livrables V0, et l'absence de secrets suivis.
    Code de sortie : 0 si tout passe, 1 sinon.
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
    'scripts/verify-foundation-docs.ps1',
    'package.json',
    'pnpm-workspace.yaml',
    'apps/api/package.json',
    'apps/web/package.json',
    'packages/media/src/index.ts',
    'e2e/v0.spec.ts',
    'tests/api.test.ts',
    'tests/media.test.ts',
    'scripts/verify-v0.ps1',
    'docs/execution/V0_24H_PROGRESS.md',
    'docs/execution/V0_RUNBOOK.md',
    'docs/reviews/V0_FINAL_AUDIT.md',
    'docs/reviews/V0_TEST_EVIDENCE.md',
    'docs/reviews/V1_TECHNICAL_GAPS.md',
    'docs/reviews/V1_IMPLEMENTATION_BASELINE.md',
    'packages/domain/src/index.ts',
    'packages/application/src/ports.ts',
    'packages/db/prisma/migrations/20261023124017_v1_00_foundation/migration.sql',
    'apps/api/src/security/session.ts',
    'eslint.config.mjs',
    'scripts/ci.ps1',
    'scripts/v1-acceptance.ps1',
    'docs/execution/V1_00_PROGRESS.md',
    'docs/execution/V1_00_ARCHITECTURE.md',
    'docs/execution/V1_00_SECURITY_EVIDENCE.md',
    'docs/execution/V1_00_ACCEPTANCE_REPORT.md',
    'docs/execution/V1_00_NEXT_STEPS.md'
)
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $rootPath $relative))) {
        $failures.Add('MISSING ' + $relative)
    }
}

$tracked = @(& git -C $rootPath ls-files)
$secretTracked = $tracked | Where-Object {
    $_ -match '(^|/)[.]env$' -or
    ($_ -match '(^|/)[.]env[.]' -and $_ -notmatch '[.]env[.]example$') -or
    $_ -match '[.](pem|key|p12|pfx)$'
}
foreach ($trackedSecret in $secretTracked) {
    $failures.Add('FORBIDDEN_TRACKED_SECRET ' + $trackedSecret)
}

if ($failures.Count -gt 0) {
    Write-Output ('FOUNDATION_CHECK_FAIL: ' + $failures.Count + ' probleme(s).')
    foreach ($failure in $failures) { Write-Output ('FAIL ' + $failure) }
    exit 1
}

Write-Output 'FOUNDATION_CHECK_PASS: documents, structure et hygiene OK.'
exit 0
