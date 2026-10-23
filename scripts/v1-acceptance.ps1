#requires -Version 7.0
<#
.SYNOPSIS
    Recette d'acceptation locale V1-00 de Vululu AI.

.DESCRIPTION
    Verifie une instance V1 deja demarree :
      1. API saine sur http://127.0.0.1:3101/api/health ;
      2. Web servi sur http://127.0.0.1:3100 et proxy /api vers l'API ;
      3. login du compte demo depuis .env (V1_BOOTSTRAP_* ou V0_DEMO_*) ;
      4. session serveur : cookie HttpOnly, CSRF double-submit, refus sans
         jeton, revocation du logout (replay -> 401) ;
      5. lecture d'un projet existant (liste + bundle) ;
      6. option -RunE2E : lance pnpm exec playwright test e2e/v0.spec.ts.

    Le script est en lecture seule pour les donnees metier (le seul effet de
    bord est la creation/revalorisation de la session et de l'audit de login,
    puis sa revocation). Il n'affiche jamais de mot de passe ni de secret.
    Aucun push, aucun deploiement, aucune publication.

    Codes de sortie :
      0  tous les controles executes sont verts ;
      1  au moins un controle a echoue, ou un service est absent.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/).

.PARAMETER ApiBase
    URL de l'API V1 (defaut http://127.0.0.1:3101).

.PARAMETER WebBase
    URL du Web V1 (defaut http://127.0.0.1:3100).

.PARAMETER ProjectId
    Projet precis a verifier. Par defaut le premier projet lisible.

.PARAMETER Email
.PARAMETER Password
    Identifiants demo. Par defaut lus dans .env (jamais affiches).

.PARAMETER RunE2E
    Lance les tests E2E Playwright (creation de donnees, base de demonstration).
    Sans ce commutateur, E2E reste explicitement NOT_RUN.

.EXAMPLE
    pwsh -NoProfile -File scripts/v1-acceptance.ps1

.EXAMPLE
    pwsh -NoProfile -File scripts/v1-acceptance.ps1 -RunE2E
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ApiBase = 'http://127.0.0.1:3101',
    [string]$WebBase = 'http://127.0.0.1:3100',
    [string]$ProjectId = '',
    [string]$Email = '',
    [string]$Password = '',
    [switch]$RunE2E
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
Set-Location -LiteralPath $rootPath

$checks = 0
$failures = New-Object System.Collections.Generic.List[string]

$ApiBase = $ApiBase.TrimEnd('/')
$WebBase = $WebBase.TrimEnd('/')

function Check {
    param(
        [string]$Name,
        [bool]$Condition,
        [string]$Detail
    )
    $script:checks = $script:checks + 1
    if ($Condition) {
        Write-Output ('PASS  ' + $Name + ' :: ' + $Detail)
    } else {
        Write-Output ('FAIL  ' + $Name + ' :: ' + $Detail)
        $script:failures.Add($Name)
    }
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

function Get-HttpResponse {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [string]$Body = '',
        $Session = $null
    )
    $parameters = @{
        Uri                = $Url
        Method             = $Method
        Headers            = $Headers
        SkipHttpErrorCheck = $true
        TimeoutSec         = 15
        UseBasicParsing    = $true
    }
    if ($null -ne $Session) {
        $parameters.WebSession = $Session
    }
    if (-not [string]::IsNullOrEmpty($Body)) {
        $parameters.Body = $Body
        $parameters.ContentType = 'application/json'
    }
    return Invoke-WebRequest @parameters
}

function Abort-Acceptance {
    param([string[]]$Lines)
    Write-Output ''
    Write-Output 'ACCEPTANCE_FAIL'
    foreach ($line in $Lines) {
        Write-Output ('  ' + $line)
    }
    if ($failures.Count -gt 0) {
        Write-Output ('  echecs: ' + ($failures -join ', '))
    }
    exit 1
}

# ---------------------------------------------------------------------------
# Identifiants demo (jamais affiches).
# ---------------------------------------------------------------------------
if ([string]::IsNullOrEmpty($Email)) {
    $Email = Get-EnvFileValue -Key 'V1_BOOTSTRAP_EMAIL'
    if ([string]::IsNullOrEmpty($Email)) {
        $Email = Get-EnvFileValue -Key 'V0_DEMO_EMAIL'
    }
}
if ([string]::IsNullOrEmpty($Password)) {
    $Password = Get-EnvFileValue -Key 'V1_BOOTSTRAP_PASSWORD'
    if ([string]::IsNullOrEmpty($Password)) {
        $Password = Get-EnvFileValue -Key 'V0_DEMO_PASSWORD'
    }
}

Write-Output ('ACCEPTANCE_ROOT=' + $rootPath)
Write-Output ('API_BASE=' + $ApiBase)
Write-Output ('WEB_BASE=' + $WebBase)
Write-Output ''

# ---------------------------------------------------------------------------
# 1-2. Sante des services V1 (3101 API, 3100 Web).
# ---------------------------------------------------------------------------
$apiOk = $false
$apiDetail = 'indisponible'
try {
    $apiHealth = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/health')
    $apiDetail = 'status=' + $apiHealth.StatusCode
    if ($apiHealth.StatusCode -eq 200) {
        $apiBody = $apiHealth.Content | ConvertFrom-Json
        $apiOk = ($apiBody.status -eq 'ok') -and ($apiBody.service -eq 'vululu-api')
        $apiDetail = 'status=' + $apiBody.status + ' service=' + $apiBody.service + ' version=' + $apiBody.version
    }
} catch {
    $apiDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'api health (3101)' $apiOk $apiDetail

$webOk = $false
$webDetail = 'indisponible'
try {
    $webHealth = Get-HttpResponse -Method 'GET' -Url ($WebBase + '/login')
    $webOk = ($webHealth.StatusCode -eq 200)
    $webDetail = 'status=' + $webHealth.StatusCode
} catch {
    $webDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'web disponible (3100)' $webOk $webDetail

$proxyOk = $false
$proxyDetail = 'non teste (web absent)'
if ($webOk) {
    try {
        $proxyHealth = Get-HttpResponse -Method 'GET' -Url ($WebBase + '/api/health')
        if ($proxyHealth.StatusCode -eq 200) {
            $proxyBody = $proxyHealth.Content | ConvertFrom-Json
            $proxyOk = ($proxyBody.status -eq 'ok') -and ($proxyBody.service -eq 'vululu-api')
            $proxyDetail = 'status=' + $proxyBody.status + ' service=' + $proxyBody.service
        } else {
            $proxyDetail = 'status=' + $proxyHealth.StatusCode
        }
    } catch {
        $proxyDetail = 'connexion impossible: ' + $_.Exception.Message
    }
}
Check 'web proxy /api -> api 3101' $proxyOk $proxyDetail

if (-not $apiOk -or -not $webOk) {
    $missing = @()
    if (-not $apiOk) {
        $missing += ('API V1 absente sur ' + $ApiBase + ' (attendu 3101). Demarrer: pnpm dev:api (ou pnpm dev).')
    }
    if (-not $webOk) {
        $missing += ('Web V1 absent sur ' + $WebBase + ' (attendu 3100). Demarrer: pnpm dev:web (ou pnpm dev).')
    }
    Abort-Acceptance -Lines ($missing + @('Aucun test E2E lance : services incomplets.'))
}

if ([string]::IsNullOrEmpty($Email) -or [string]::IsNullOrEmpty($Password)) {
    Abort-Acceptance -Lines @(
        'Identifiants demo absents : renseigner V1_BOOTSTRAP_EMAIL/V1_BOOTSTRAP_PASSWORD',
        'ou V0_DEMO_EMAIL/V0_DEMO_PASSWORD dans .env, ou utiliser -Email/-Password.'
    )
}

# ---------------------------------------------------------------------------
# 3. Login demo.
# ---------------------------------------------------------------------------
$authSession = $null
$loginOk = $false
$loginDetail = ''
try {
    $loginParameters = @{
        Uri                = ($ApiBase + '/api/auth/login')
        Method             = 'POST'
        Body               = (@{ email = $Email; password = $Password } | ConvertTo-Json -Compress)
        ContentType        = 'application/json'
        SessionVariable    = 'authSession'
        SkipHttpErrorCheck = $true
        TimeoutSec         = 15
        UseBasicParsing    = $true
    }
    $login = Invoke-WebRequest @loginParameters
    $loginOk = ($login.StatusCode -eq 200)
    $loginDetail = 'status=' + $login.StatusCode
} catch {
    $loginDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'demo login' $loginOk $loginDetail

if (-not $loginOk) {
    Abort-Acceptance -Lines @(
        'Login demo refuse : verifier le compte demo seede (pnpm db:seed) et les identifiants .env.',
        'Verifier que la base utilisee par l API est bien migree et seedee.'
    )
}

$loginBody = $login.Content | ConvertFrom-Json
$csrfToken = ''
if ($null -ne $loginBody.csrfToken) {
    $csrfToken = [string]$loginBody.csrfToken
}
Check 'login csrfToken present' ($csrfToken.Length -ge 20) ('length=' + $csrfToken.Length)
$loginEmail = ''
$loginRole = ''
if ($null -ne $loginBody.user) {
    $loginEmail = [string]$loginBody.user.email
    $loginRole = [string]$loginBody.user.role
}
Check 'login utilisateur attendu' ($loginEmail -eq $Email) ('email=' + $loginEmail + ' role=' + $loginRole)

# ---------------------------------------------------------------------------
# 4. Session serveur et CSRF.
# ---------------------------------------------------------------------------
$cookieUri = [uri]$ApiBase
$sessionCookie = $null
$csrfCookie = $null
try {
    $cookies = $authSession.Cookies.GetCookies($cookieUri)
    $sessionCookie = $cookies | Where-Object { $_.Name -eq 'session' } | Select-Object -First 1
    $csrfCookie = $cookies | Where-Object { $_.Name -eq 'vululu_csrf' } | Select-Object -First 1
} catch {
    # Les controles suivants echoueront explicitement.
}
Check 'cookie session present' ($null -ne $sessionCookie -and $sessionCookie.Value.Length -ge 20) 'session cookie'
if ($null -ne $sessionCookie) {
    Check 'cookie session HttpOnly' ([bool]$sessionCookie.HttpOnly) ('httponly=' + $sessionCookie.HttpOnly)
}
Check 'cookie csrf lisible' ($null -ne $csrfCookie -and -not $csrfCookie.HttpOnly) 'vululu_csrf non HttpOnly'
if ($null -ne $csrfCookie) {
    Check 'csrf double-submit (cookie=body)' ($csrfCookie.Value -eq $csrfToken) 'valeur identique'
}

$meOk = $false
$meDetail = ''
try {
    $me = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/auth/me') -Session $authSession
    $meOk = ($me.StatusCode -eq 200)
    if (-not $meOk) {
        $meDetail = 'status=' + $me.StatusCode
    } else {
        $meBody = $me.Content | ConvertFrom-Json
        $meDetail = 'email=' + $meBody.user.email + ' role=' + $meBody.user.role
    }
} catch {
    $meDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'session valide (GET /api/auth/me)' $meOk $meDetail

$anonOk = $false
$anonDetail = ''
try {
    $anon = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/auth/me')
    $anonOk = ($anon.StatusCode -eq 401)
    $anonDetail = 'status=' + $anon.StatusCode
} catch {
    $anonDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'me sans session refuse (401)' $anonOk $anonDetail

# Mutation sans jeton CSRF : le logout doit etre refuse avant execution.
$csrfEnforced = $false
$csrfDetail = ''
try {
    $logoutNoCsrf = Get-HttpResponse -Method 'POST' -Url ($ApiBase + '/api/auth/logout') -Session $authSession
    $csrfDetail = 'status=' + $logoutNoCsrf.StatusCode
    if ($logoutNoCsrf.StatusCode -eq 403) {
        $errorCode = ''
        try {
            $errorCode = [string](($logoutNoCsrf.Content | ConvertFrom-Json).error)
        } catch {
            $errorCode = ''
        }
        $csrfEnforced = ($errorCode -eq 'csrf_invalid')
        $csrfDetail = 'status=403 error=' + $errorCode
    }
} catch {
    $csrfDetail = 'connexion impossible: ' + $_.Exception.Message
}
Check 'mutation sans CSRF refusee (403 csrf_invalid)' $csrfEnforced $csrfDetail

# ---------------------------------------------------------------------------
# 5. Projet existant (lecture seule).
# ---------------------------------------------------------------------------
$projectTargetId = $ProjectId
if ([string]::IsNullOrEmpty($projectTargetId)) {
    $projectsOk = $false
    $projectsDetail = ''
    try {
        $projects = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/projects') -Session $authSession
        $projectsOk = ($projects.StatusCode -eq 200)
        $projectsDetail = 'status=' + $projects.StatusCode
        if ($projectsOk) {
            $items = @(($projects.Content | ConvertFrom-Json).items)
            $projectsDetail = 'projets=' + $items.Count
            if ($items.Count -gt 0) {
                $projectTargetId = [string]$items[0].id
            }
        }
    } catch {
        $projectsDetail = 'connexion impossible: ' + $_.Exception.Message
    }
    Check 'liste des projets (200)' $projectsOk $projectsDetail
}

Check 'projet existant disponible' (-not [string]::IsNullOrEmpty($projectTargetId)) ('projectId=' + $projectTargetId)

if (-not [string]::IsNullOrEmpty($projectTargetId)) {
    $bundleOk = $false
    $bundleDetail = ''
    try {
        $bundleResponse = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/projects/' + $projectTargetId) -Session $authSession
        $bundleOk = ($bundleResponse.StatusCode -eq 200)
        $bundleDetail = 'status=' + $bundleResponse.StatusCode
        if ($bundleOk) {
            $bundle = $bundleResponse.Content | ConvertFrom-Json
            $sceneCount = @($bundle.scenes).Count
            $masterVersion = if ($null -ne $bundle.master) { [string]$bundle.master.version } else { 'aucun' }
            $qaStatus = if ($null -ne $bundle.master) { [string]$bundle.master.qaStatus } else { 'n/a' }
            $bundleDetail = 'title=' + $bundle.project.title + ' status=' + $bundle.project.status + ' scenes=' + $sceneCount + ' masterVersion=' + $masterVersion + ' qa=' + $qaStatus
            Check 'bundle projet lisible' ($bundle.project.id -eq $projectTargetId) $bundleDetail
            Check 'projet avec scenes' ($sceneCount -gt 0) ('scenes=' + $sceneCount)
            if ($null -eq $bundle.master) {
                Write-Output 'INFO  master absent :: projet non encore produit (non bloquant pour V1-00)'
            }
        } else {
            Check 'bundle projet lisible' $false $bundleDetail
        }
    } catch {
        Check 'bundle projet lisible' $false ('connexion impossible: ' + $_.Exception.Message)
    }
}

# ---------------------------------------------------------------------------
# Logout CSRF valide, puis verification de la revocation serveur.
# ---------------------------------------------------------------------------
$sessionToken = ''
if ($null -ne $sessionCookie) {
    $sessionToken = $sessionCookie.Value
}
$logoutOk = $false
$logoutDetail = ''
if (-not [string]::IsNullOrEmpty($sessionToken)) {
    try {
        $logout = Get-HttpResponse -Method 'POST' -Url ($ApiBase + '/api/auth/logout') -Session $authSession -Headers @{ 'x-csrf-token' = $csrfToken } -Body '{}'
        $logoutOk = ($logout.StatusCode -eq 200)
        $logoutDetail = 'status=' + $logout.StatusCode
    } catch {
        $logoutDetail = 'connexion impossible: ' + $_.Exception.Message
    }
} else {
    $logoutDetail = 'session cookie absent'
}
Check 'logout avec CSRF accepte' $logoutOk $logoutDetail

$replayRejected = $false
$replayDetail = 'session token absent'
if (-not [string]::IsNullOrEmpty($sessionToken)) {
    try {
        $replay = Get-HttpResponse -Method 'GET' -Url ($ApiBase + '/api/auth/me') -Headers @{ 'Cookie' = ('session=' + $sessionToken) }
        $replayRejected = ($replay.StatusCode -eq 401)
        $replayDetail = 'status=' + $replay.StatusCode
    } catch {
        $replayDetail = 'connexion impossible: ' + $_.Exception.Message
    }
}
Check 'session revoquee refusee (replay -> 401)' $replayRejected $replayDetail

# ---------------------------------------------------------------------------
# 6. E2E optionnel, jamais simule.
# ---------------------------------------------------------------------------
if ($RunE2E) {
    Write-Output ''
    Write-Output 'E2E: lancement de pnpm exec playwright test e2e/v0.spec.ts'
    $e2eExit = 1
    try {
        & pnpm exec playwright test e2e/v0.spec.ts
        $e2eExit = $LASTEXITCODE
    } catch {
        Write-Output ('E2E: exception: ' + $_.Exception.Message)
        $e2eExit = 1
    }
    Check 'tests E2E Playwright' ($e2eExit -eq 0) ('exit=' + $e2eExit)
    if ($e2eExit -ne 0) {
        Write-Output 'INFO  E2E en echec : verifier playwright.config.ts (web 3100/API 3101), les donnees persistantes de la base de demo (G-20) et les services.'
    }
} else {
    Write-Output ''
    Write-Output 'E2E: NOT_RUN (option -RunE2E absente).'
}

# ---------------------------------------------------------------------------
# Resume et code de sortie reel.
# ---------------------------------------------------------------------------
Write-Output ''
if ($failures.Count -gt 0) {
    Write-Output ('ACCEPTANCE_FAIL: ' + $failures.Count + ' echec(s) sur ' + $checks + ' controle(s).')
    foreach ($failure in $failures) {
        Write-Output ('  FAILED: ' + $failure)
    }
    Write-Output 'Remediation : verifier les services 3101/3100, le seed demo, la base et les migrations.'
    exit 1
}

Write-Output ('ACCEPTANCE_PASS: ' + $checks + ' controles verts.')
if (-not $RunE2E) {
    Write-Output 'E2E=NOT_RUN'
}
exit 0