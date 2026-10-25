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
    'docs/execution/V1_00_NEXT_STEPS.md',
    'packages/db/prisma/migrations/20261023160509_v1_01_a_snapshot_versioning/migration.sql',
    'packages/application/src/use-cases/briefs.ts',
    'packages/application/src/use-cases/storyboards.ts',
    'packages/application/src/use-cases/messages.ts',
    'packages/application/src/use-cases/scenes.ts',
    'packages/application/src/use-cases/bundle.ts',
    'packages/application/src/use-cases/artifacts.ts',
    'packages/application/src/use-cases/production.ts',
    'apps/api/src/infrastructure/prisma/briefStore.ts',
    'apps/api/src/infrastructure/prisma/storyboardStore.ts',
    'apps/api/src/infrastructure/prisma/productionRunRepository.ts',
    'apps/api/src/infrastructure/production/localProductionExecutor.ts',
    'apps/api/src/infrastructure/prisma/artifactAccess.ts',
    'tests/v1/v1-01-application.test.ts',
    'docs/execution/V1_01_A_LEGACY_MIGRATION.md',
    'docs/execution/V1_01_A_SNAPSHOTS.md',
    'docs/execution/V1_01_A_TEST_EVIDENCE.md',
    'docs/execution/V1_01_A_RISKS_VERDICT.md',
    'docs/adr/0006-application-layer-et-snapshots-versionnes.md',
    'docs/adr/0007-consolidation-applicative-et-suppression-legacy.md',
    'docs/adr/0008-agentic-capabilities-registre-et-routeur.md',
    'docs/execution/V1_01_A1_ARCHITECTURE.md',
    'docs/execution/V1_01_A1_TRANSACTIONS_CONCURRENCY.md',
    'docs/execution/V1_01_A1_ARTIFACT_COHERENCE.md',
    'docs/execution/V1_01_A1_TEST_EVIDENCE.md',
    'docs/execution/V1_01_A1_RISKS_VERDICT.md',
    'scripts/audit-artifacts.ps1',
    'packages/domain/src/agents.ts',
    'packages/domain/src/capabilities.ts',
    'packages/application/src/use-cases/agents.ts',
    'packages/application/src/use-cases/provider-catalog.ts',
    'packages/application/src/use-cases/routing.ts',
    'apps/api/src/infrastructure/prisma/agentRepository.ts',
    'apps/api/src/infrastructure/prisma/providerCatalogRepository.ts',
    'apps/api/src/routes/adminAgents.ts',
    'packages/db/prisma/migrations/20261023183000_v1_01_b_agentic_capabilities/migration.sql',
    'tests/domain/agentic.test.ts',
    'tests/v1/v1-01-b-agentic.test.ts',
    'docs/execution/V1_01_B_AGENTIC_CAPABILITIES.md',
    'docs/execution/V1_01_B_TEST_EVIDENCE.md',
    'docs/execution/V1_01_C_POC_ARCHITECTURE.md',
    'docs/execution/V1_01_C_CRASH_RECOVERY_EVIDENCE.md',
    'docs/execution/V1_01_C_IDEMPOTENCY.md',
    'docs/execution/V1_01_C_APPROVAL_TIMEOUT_BUDGET.md',
    'docs/execution/V1_01_C_OPERATIONS.md',
    'docs/execution/V1_01_C_FINAL_VERDICT.md',
    'docs/adr/0009-poc-hatchet-durabilite-prouvee.md',
    'docs/execution/V1_01_D_ARCHITECTURE.md',
    'docs/execution/V1_01_D_STATE_MACHINE.md',
    'docs/execution/V1_01_D_ORCHESTRATION.md',
    'docs/execution/V1_01_D_OUTBOX_RECOVERY.md',
    'docs/execution/V1_01_D_AGENT_ROUTING.md',
    'docs/execution/V1_01_D_APPROVAL_SECURITY.md',
    'docs/execution/V1_01_D_OBSERVABILITY.md',
    'docs/execution/V1_01_D_TEST_EVIDENCE.md',
    'docs/execution/V1_01_D_FINAL_AUDIT.md',
    'docs/adr/0010-orchestration-durable-outbox-hatchet.md',
    'docs/execution/V1_01_E_STORAGE_ARCHITECTURE.md',
    'docs/execution/V1_01_E_STORAGE_PORTS_ADAPTERS.md',
    'docs/execution/V1_01_E_ARTIFACT_VERSIONING.md',
    'docs/execution/V1_01_E_FINALIZATION_RECOVERY.md',
    'docs/execution/V1_01_E_MEDIA_PROVENANCE.md',
    'docs/execution/V1_01_E_HATCHET_INTEGRATION.md',
    'docs/execution/V1_01_E_SECURITY_LIFECYCLE.md',
    'docs/execution/V1_01_E_MIGRATION_COMPATIBILITY.md',
    'docs/execution/V1_01_E_TEST_EVIDENCE.md',
    'docs/execution/V1_01_E_FINAL_AUDIT.md',
    'docs/adr/0011-artefacts-immuables-stockage-interchangeable.md',
    'docs/execution/V1_01_F_SECURITY_HARDENING.md',
    'docs/execution/V1_01_F_AUTH_SESSIONS_RBAC.md',
    'docs/execution/V1_01_F_RATE_LIMITS_BUDGETS.md',
    'docs/execution/V1_01_F_OBSERVABILITY_TRACING.md',
    'docs/execution/V1_01_F_WORKER_SUPERVISION_RECOVERY.md',
    'docs/execution/V1_01_F_STORAGE_SECURITY.md',
    'docs/execution/V1_01_F_LINT_CI_QUALITY.md',
    'docs/execution/V1_01_F_TEST_EVIDENCE.md',
    'docs/execution/V1_01_F_FINAL_AUDIT.md',
    'docs/adr/0012-durcissement-securite-observabilite.md',
    'docs/certification/V1_ARCHITECTURE_FINAL.md',
    'docs/certification/V1_CAPABILITIES_MATRIX.md',
    'docs/certification/V1_INVARIANTS_AND_EVIDENCE.md',
    'docs/certification/V1_SECURITY_AND_RESILIENCE.md',
    'docs/certification/V1_TECHNICAL_DEBT_REGISTER.md',
    'docs/certification/V1_DEPLOYMENT_READINESS.md',
    'docs/certification/V1_FINAL_CERTIFICATION.md',
    'docs/certification/V1_GIT_REVIEW_HANDOFF.md',
    'docs/adr/0013-certification-locale-readiness-separees.md',
    'apps/api/src/security/origin.ts',
    'apps/api/src/infrastructure/security/rateLimiter.ts',
    'apps/api/src/infrastructure/operations/runtimeReconciliation.ts',
    'apps/api/src/infrastructure/storage/s3ArtifactStorage.ts',
    'apps/api/src/infrastructure/durable/prismaArtifactPublisher.ts',
    'packages/domain/src/productionState.ts',
    'packages/application/src/use-cases/durableProduction.ts',
    'apps/api/src/infrastructure/durable/outboxDispatcher.ts',
    'apps/api/src/worker/pipeline.ts',
    'poc/hatchet/src/pipeline.ts',
    'poc/hatchet/src/worker.ts',
    'poc/hatchet/src/ledger.ts',
    'poc/hatchet/docker-compose.hatchet.yml',
    'poc/hatchet/scripts/harness.ps1'
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