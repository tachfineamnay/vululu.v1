#requires -Version 7.0
<#
.SYNOPSIS
    Runner CI local Vululu AI V1-00 (miroir des jobs GitHub Actions).

.DESCRIPTION
    Execute, dans l'ordre, les etapes de qualite suivantes :
      1. lint       pnpm lint (ESLint 10 flat config)
      2. typecheck  pnpm typecheck (tsc --noEmit sur tous les packages)
      3. tests      suite complete ou sous-ensemble choisi
      4. build      pnpm build (API tsc + Next build)
      5. secrets    scripts/check-secrets.ps1
    Le client Prisma est genere avant les etapes qui en dependent. Sur
    Windows, si un serveur de dev verrouille la DLL Prisma, le client existant
    n'est reutilise que s'il est plus recent que schema.prisma (sinon FAIL).

    Chaque etape expose son vrai code de sortie. Le script retourne :
      0  toutes les etapes executees sont vertes (les SKIP ne comptent pas) ;
      1  au moins une etape executee a echoue ;
      2  preflight impossible (Node/pnpm/dependances/env manquants) ou usage
         incorrect (aucune etape selectionnee).

    Aucun resultat n'est simule : une etape ignoree est marquee SKIP, jamais
    PASS. Pre-requis : pnpm install --frozen-lockfile deja execute, PostgreSQL
    local sur 127.0.0.1:55432 pour les tests API/V1, FFmpeg pour les tests media.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/).

.PARAMETER SkipLint
    Ignore l'etape lint.

.PARAMETER SkipTypecheck
    Ignore l'etape typecheck.

.PARAMETER SkipTests
    Ignore l'etape tests.

.PARAMETER SkipBuild
    Ignore l'etape build.

.PARAMETER SkipSecrets
    Ignore le scan de secrets.

.PARAMETER TestSet
    Sous-ensemble de tests : all (defaut), domain, api, v1, media.
    'domain' ne requiert ni base de donnees ni FFmpeg.

.PARAMETER TestFiles
    Filtres de fichiers transmis a vitest (remplace TestSet). Exemple :
    -TestFiles tests/domain. La verification des prerequis (base, FFmpeg) est
    deduite de facon conservatrice : filtre domain -> aucune base, filtre media
    -> FFmpeg, tout autre filtre -> PostgreSQL.

.EXAMPLE
    pwsh -NoProfile -File scripts/ci.ps1 -SkipTests

.EXAMPLE
    pwsh -NoProfile -File scripts/ci.ps1 -TestSet domain -SkipBuild -SkipSecrets

.NOTES
    Aucun push, aucun deploiement, aucune publication dans ce script.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$SkipLint,
    [switch]$SkipTypecheck,
    [switch]$SkipTests,
    [switch]$SkipBuild,
    [switch]$SkipSecrets,
    [ValidateSet('all', 'domain', 'api', 'v1', 'media')]
    [string]$TestSet = 'all',
    [string[]]$TestFiles = @()
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
Set-Location -LiteralPath $rootPath
$script:startedAt = Get-Date

$results = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]

function Write-Section([string]$Text) {
    Write-Host ''
    Write-Host ('=== ' + $Text + ' ===')
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMs = 2000
    )
    $client = $null
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $task = $client.ConnectAsync($HostName, $Port)
        if ($task.Wait($TimeoutMs) -and $client.Connected) {
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($null -ne $client) {
            $client.Dispose()
        }
    }
}

function Add-Result {
    param(
        [string]$Step,
        [string]$Status,
        [int]$ExitCode,
        [double]$Seconds
    )
    $results.Add([pscustomobject]@{
        Step    = $Step
        Status  = $Status
        ExitCode = $ExitCode
        Seconds = $Seconds
    })
    if ($Status -eq 'FAIL') {
        $failures.Add($Step)
    }
}

function Invoke-CiStep {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Section ($Name + ' — START')
    $started = Get-Date
    $exitCode = 0
    $global:LASTEXITCODE = 0
    try {
        # Out-Host : la sortie de l'etape est affichee mais ne pollue pas la
        # valeur de retour (le code de sortie natif reste seul retourne).
        & $Action 2>&1 | Out-Host
        if ($null -ne $LASTEXITCODE) {
            $exitCode = [int]$LASTEXITCODE
        }
    } catch {
        Write-Host ('[' + $Name + '] EXCEPTION: ' + $_.Exception.Message)
        $exitCode = 1
    }
    $seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    $status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
    Add-Result -Step $Name -Status $status -ExitCode $exitCode -Seconds $seconds
    Write-Host ('=== ' + $Name + ' — ' + $status + ' (exit=' + $exitCode + ', ' + $seconds + 's) ===')
    return $exitCode
}

function Skip-CiStep {
    param(
        [string]$Name,
        [string]$Reason
    )
    Add-Result -Step $Name -Status 'SKIP' -ExitCode 0 -Seconds 0
    Write-Host ('=== ' + $Name + ' — SKIP (' + $Reason + ') ===')
}

function Get-EnvFileValue {
    param([string]$Key)
    $envPath = Join-Path $rootPath '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        return ''
    }
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '=') } | Select-Object -First 1
    if (-not $line) {
        return ''
    }
    return ($line.Substring($line.IndexOf('=') + 1)).Trim().Trim('"').Trim("'")
}

function Get-GeneratedPrismaSchemaPath {
    $pnpmStore = Join-Path $rootPath 'node_modules/.pnpm'
    if (-not (Test-Path -LiteralPath $pnpmStore)) {
        return $null
    }
    $candidates = Get-ChildItem -LiteralPath $pnpmStore -Directory -Filter '@prisma+client@*' | ForEach-Object {
        Join-Path $_.FullName 'node_modules/.prisma/client/schema.prisma'
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }
    return $null
}

# ---------------------------------------------------------------------------
# Preflight : outils, version Node, etapes selectionnees.
# ---------------------------------------------------------------------------
Write-Section 'CI PREFLIGHT'
Write-Host ('Root: ' + $rootPath)
Write-Host ('PowerShell: ' + $PSVersionTable.PSVersion.ToString())

if (-not (Test-Path -LiteralPath (Join-Path $rootPath 'package.json'))) {
    Write-Host 'CI_FAIL: package.json introuvable a la racine du depot.'
    exit 2
}

$nodeVersion = ''
try {
    $nodeVersion = ((& node --version 2>$null) | Select-Object -First 1)
} catch {
    $nodeVersion = ''
}
if ([string]::IsNullOrWhiteSpace($nodeVersion)) {
    Write-Host 'CI_FAIL: Node.js introuvable dans le PATH.'
    exit 2
}
$nodeVersion = $nodeVersion.Trim()
$nodeMajor = 0
if ($nodeVersion -match '^v(\d+)') {
    $nodeMajor = [int]$Matches[1]
}
if ($nodeMajor -lt 24) {
    Write-Host ('CI_FAIL: Node.js 24 requis, version detectee ' + $nodeVersion)
    exit 2
}
Write-Host ('Node: ' + $nodeVersion)

$pnpmVersion = ''
try {
    $pnpmVersion = ((& pnpm --version 2>$null) | Select-Object -First 1)
} catch {
    $pnpmVersion = ''
}
if ([string]::IsNullOrWhiteSpace($pnpmVersion)) {
    Write-Host 'CI_FAIL: pnpm introuvable dans le PATH.'
    exit 2
}
Write-Host ('pnpm: ' + $pnpmVersion.Trim())

if (-not (Test-Path -LiteralPath (Join-Path $rootPath 'node_modules'))) {
    Write-Host 'CI_FAIL: node_modules absent. Lancer: pnpm install --frozen-lockfile'
    exit 2
}

$testFilters = @($TestFiles | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if (-not $SkipTests -and $testFilters.Count -gt 0 -and $TestSet -ne 'all') {
    Write-Host 'CI_FAIL: -TestSet et -TestFiles sont exclusifs.'
    exit 2
}

$needsDb = $false
$needsFfmpeg = $false
if (-not $SkipTests) {
    if ($testFilters.Count -gt 0) {
        foreach ($filter in $testFilters) {
            $normalized = $filter.ToLowerInvariant()
            if ($normalized.Contains('media')) {
                $needsFfmpeg = $true
            }
            if (-not $normalized.Contains('domain') -and -not $normalized.Contains('media')) {
                $needsDb = $true
            }
        }
    } else {
        switch ($TestSet) {
            'domain' { }
            'media' { $needsFfmpeg = $true }
            default { $needsDb = $true }
        }
    }
}

$selectedSteps = 0
if (-not $SkipLint) { $selectedSteps++ }
if (-not $SkipTypecheck) { $selectedSteps++ }
if (-not $SkipTests) { $selectedSteps++ }
if (-not $SkipBuild) { $selectedSteps++ }
if (-not $SkipSecrets) { $selectedSteps++ }
if ($selectedSteps -eq 0) {
    Write-Host 'CI_FAIL: aucune etape selectionnee (toutes ignorees).'
    exit 2
}

$needsPrisma = (-not $SkipTypecheck) -or (-not $SkipTests) -or (-not $SkipBuild)
Write-Host ('Tests: ' + $(if ($SkipTests) { 'SKIP' } elseif ($testFilters.Count -gt 0) { ($testFilters -join ', ') } else { $TestSet }))
Write-Host ('Prerequis: PostgreSQL=' + $(if ($needsDb) { 'requis' } else { 'non requis' }) + ', FFmpeg=' + $(if ($needsFfmpeg) { 'requis' } else { 'non requis' }))

# ---------------------------------------------------------------------------
# Generation du client Prisma (necessaire a typecheck/tests/build).
# ---------------------------------------------------------------------------
$prismaReady = $true
if ($needsPrisma) {
    Write-Section 'prisma-generate — START'
    $prismaStarted = Get-Date
    $global:LASTEXITCODE = 0
    & pnpm db:generate 2>&1 | Out-Host
    $prismaExit = [int]$LASTEXITCODE
    if ($prismaExit -ne 0) {
        # Windows : un serveur de dev Node peut verrouiller la DLL du query
        # engine et faire echouer la copie. Si le client deja genere est plus
        # recent que le schema, on le reutilise explicitement (WARN) ; sinon
        # l'etape echoue pour eviter un faux vert sur un client obsolete.
        $generatedSchema = Get-GeneratedPrismaSchemaPath
        $sourceSchema = Join-Path $rootPath 'packages/db/prisma/schema.prisma'
        if ($null -ne $generatedSchema -and (Test-Path -LiteralPath $sourceSchema)) {
            $sourceTime = (Get-Item -LiteralPath $sourceSchema).LastWriteTimeUtc
            $generatedTime = (Get-Item -LiteralPath $generatedSchema).LastWriteTimeUtc
            if ($generatedTime -gt $sourceTime) {
                Write-Host 'WARN: generation Prisma impossible (fichier verrouille par un process Node actif), client existant reutilise.'
                Write-Host ('WARN: client genere ' + $generatedTime.ToString('s') + ' > schema ' + $sourceTime.ToString('s') + '.')
                $prismaExit = 0
            } else {
                Write-Host 'FAIL: client Prisma plus ancien que schema.prisma et generation impossible.'
                Write-Host '      Arreter les serveurs de dev (pnpm dev) puis relancer scripts/ci.ps1.'
            }
        } else {
            Write-Host 'FAIL: generation Prisma impossible et aucun client genere detectable.'
        }
    }
    $prismaSeconds = [math]::Round(((Get-Date) - $prismaStarted).TotalSeconds, 1)
    if ($prismaExit -eq 0) {
        Add-Result -Step 'prisma-generate' -Status 'PASS' -ExitCode 0 -Seconds $prismaSeconds
        Write-Host ('=== prisma-generate — PASS (exit=0, ' + $prismaSeconds + 's) ===')
    } else {
        Add-Result -Step 'prisma-generate' -Status 'FAIL' -ExitCode $prismaExit -Seconds $prismaSeconds
        Write-Host ('=== prisma-generate — FAIL (exit=' + $prismaExit + ', ' + $prismaSeconds + 's) ===')
        $prismaReady = $false
    }
} else {
    Skip-CiStep -Name 'prisma-generate' -Reason 'aucune etape TypeScript selectionnee'
}

# ---------------------------------------------------------------------------
# 1. Lint
# ---------------------------------------------------------------------------
if ($SkipLint) {
    Skip-CiStep -Name 'lint' -Reason 'demande explicite'
} else {
    Invoke-CiStep -Name 'lint' -Action { & pnpm lint } | Out-Null
}

# ---------------------------------------------------------------------------
# 2. Typecheck
# ---------------------------------------------------------------------------
if ($SkipTypecheck) {
    Skip-CiStep -Name 'typecheck' -Reason 'demande explicite'
} elseif (-not $prismaReady) {
    Add-Result -Step 'typecheck' -Status 'FAIL' -ExitCode 1 -Seconds 0
    Write-Host '=== typecheck — FAIL (client Prisma non genere) ==='
} else {
    Invoke-CiStep -Name 'typecheck' -Action { & pnpm typecheck } | Out-Null
}

# ---------------------------------------------------------------------------
# 3. Tests (base de test isolee et FFmpeg verifies avant execution).
# ---------------------------------------------------------------------------
if ($SkipTests) {
    Skip-CiStep -Name 'tests' -Reason 'demande explicite (-SkipTests)'
} else {
    $prereqOk = $true

    if ($needsDb) {
        if (-not (Test-TcpPort -HostName '127.0.0.1' -Port 55432 -TimeoutMs 2000)) {
            Write-Host 'TESTS_PREREQ_FAIL: PostgreSQL attendu sur 127.0.0.1:55432 (base vululu_v1_00_test) indisponible.'
            Write-Host '  Demarrer la base locale puis relancer (ex: pwsh -NoProfile -File scripts/dev-db.ps1 start).'
            $prereqOk = $false
        }
        $sessionSecret = $env:SESSION_SECRET
        if ([string]::IsNullOrWhiteSpace($sessionSecret)) {
            $sessionSecret = Get-EnvFileValue -Key 'SESSION_SECRET'
        }
        if ([string]::IsNullOrEmpty($sessionSecret) -or $sessionSecret.Length -lt 32) {
            Write-Host 'TESTS_PREREQ_FAIL: SESSION_SECRET absent ou trop court (>= 32 caracteres) pour les tests API.'
            Write-Host '  Renseigner .env ou la variable d environnement SESSION_SECRET (valeur non affichee).'
            $prereqOk = $false
        }
    }

    if ($needsFfmpeg) {
        $ffmpegPath = $env:FFMPEG_PATH
        if ([string]::IsNullOrWhiteSpace($ffmpegPath)) {
            $ffmpegPath = Get-EnvFileValue -Key 'FFMPEG_PATH'
        }
        if ([string]::IsNullOrWhiteSpace($ffmpegPath)) {
            $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
            if ($null -ne $ffmpegCommand) {
                $ffmpegPath = $ffmpegCommand.Source
            }
        }
        if ([string]::IsNullOrWhiteSpace($ffmpegPath) -or -not (Test-Path -LiteralPath $ffmpegPath -PathType Leaf)) {
            Write-Host 'TESTS_PREREQ_FAIL: FFmpeg introuvable (FFMPEG_PATH dans .env ou binaire ffmpeg dans le PATH).'
            Write-Host '  Les tests media sont requis pour la suite complete ; utiliser -TestSet domain pour un sous-ensemble sans FFmpeg.'
            $prereqOk = $false
        } else {
            Write-Host ('FFmpeg: ' + $ffmpegPath)
        }
    }

    if (-not $prereqOk) {
        Add-Result -Step 'tests' -Status 'FAIL' -ExitCode 1 -Seconds 0
    } else {
        if ($testFilters.Count -gt 0) {
            Invoke-CiStep -Name 'tests' -Action { & pnpm exec vitest run @testFilters } | Out-Null
        } else {
            switch ($TestSet) {
                'all' { Invoke-CiStep -Name 'tests' -Action { & pnpm test } | Out-Null }
                'domain' { Invoke-CiStep -Name 'tests' -Action { & pnpm exec vitest run tests/domain } | Out-Null }
                'api' { Invoke-CiStep -Name 'tests' -Action { & pnpm exec vitest run tests/api.test.ts } | Out-Null }
                'v1' { Invoke-CiStep -Name 'tests' -Action { & pnpm exec vitest run tests/v1 } | Out-Null }
                'media' { Invoke-CiStep -Name 'tests' -Action { & pnpm exec vitest run tests/media.test.ts } | Out-Null }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
if ($SkipBuild) {
    Skip-CiStep -Name 'build' -Reason 'demande explicite'
} elseif (-not $prismaReady) {
    Add-Result -Step 'build' -Status 'FAIL' -ExitCode 1 -Seconds 0
    Write-Host '=== build — FAIL (client Prisma non genere) ==='
} else {
    Invoke-CiStep -Name 'build' -Action { & pnpm build } | Out-Null
}

# ---------------------------------------------------------------------------
# 5. Scan de secrets
# ---------------------------------------------------------------------------
if ($SkipSecrets) {
    Skip-CiStep -Name 'secrets' -Reason 'demande explicite'
} else {
    Invoke-CiStep -Name 'secrets' -Action { & pwsh -NoProfile -File (Join-Path $rootPath 'scripts/check-secrets.ps1') } | Out-Null
}

# ---------------------------------------------------------------------------
# Resume et code de sortie reel.
# ---------------------------------------------------------------------------
$passCount = @($results | Where-Object { $_.Status -eq 'PASS' }).Count
$skipCount = @($results | Where-Object { $_.Status -eq 'SKIP' }).Count
$failCount = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$totalSeconds = [math]::Round(((Get-Date) - $script:startedAt).TotalSeconds, 1)

Write-Host ''
Write-Host '=== CI SUMMARY ==='
foreach ($result in $results) {
    Write-Host ('STEP ' + $result.Step.PadRight(18) + ' ' + $result.Status.PadRight(5) + ' exit=' + $result.ExitCode + ' ' + $result.Seconds + 's')
}
Write-Host ('TOTAL=' + $totalSeconds + 's PASS=' + $passCount + ' SKIP=' + $skipCount + ' FAIL=' + $failCount)

if ($failCount -gt 0) {
    Write-Host ('CI_RESULT=FAIL failed=' + ($failures -join ','))
    exit 1
}

Write-Host 'CI_RESULT=PASS'
exit 0
