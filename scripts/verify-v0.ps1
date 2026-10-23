#requires -Version 7.0
<#
.SYNOPSIS
    Verification de la verticale V0 Vululu AI.
.DESCRIPTION
    Se connecte a l API locale, retrouve le dernier projet transfere,
    verifie les cinq scenes, les versions, le master MP4, la QA, l approbation
    et le transfert Postiz mock. Ne modifie aucune donnee.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ApiBase = 'http://127.0.0.1:3001'
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]
$checks = 0

function Check([string]$Name, [bool]$Condition, [string]$Detail) {
    $script:checks = $script:checks + 1
    if ($Condition) {
        Write-Output ('PASS  ' + $Name + ' :: ' + $Detail)
    } else {
        Write-Output ('FAIL  ' + $Name + ' :: ' + $Detail)
        $script:failures.Add($Name)
    }
}

$envPath = Join-Path $rootPath '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Output 'V0_VERIFY_FAIL: .env absent. Lancer le runbook.'
    exit 1
}
$envLines = Get-Content -LiteralPath $envPath
$emailLine = $envLines | Where-Object { $_ -like 'V0_DEMO_EMAIL=*' } | Select-Object -First 1
$passwordLine = $envLines | Where-Object { $_ -like 'V0_DEMO_PASSWORD=*' } | Select-Object -First 1
$email = if ($emailLine) { $emailLine.Substring('V0_DEMO_EMAIL='.Length) } else { 'demo@vululu.local' }
$password = if ($passwordLine) { $passwordLine.Substring('V0_DEMO_PASSWORD='.Length) } else { 'vululu-demo' }

try {
    $health = Invoke-RestMethod -Uri ($ApiBase + '/api/health') -TimeoutSec 5
    Check 'api health' ($health.status -eq 'ok') ($health.service + ' ' + $health.version)
} catch {
    Check 'api health' $false 'API indisponible'
    Write-Output 'V0_VERIFY_FAIL'
    exit 1
}

$body = @{ email = $email; password = $password } | ConvertTo-Json
$login = Invoke-WebRequest -Uri ($ApiBase + '/api/auth/login') -Method POST -Body $body -ContentType 'application/json' -SessionVariable session -UseBasicParsing -TimeoutSec 10
Check 'demo login' ($login.StatusCode -eq 200) ('status=' + $login.StatusCode)

$projects = (Invoke-RestMethod -Uri ($ApiBase + '/api/projects') -WebSession $session -TimeoutSec 10).items
Check 'projects exist' (@($projects).Count -gt 0) ('count=' + @($projects).Count)

$bundle = $null
foreach ($project in $projects) {
    $candidate = Invoke-RestMethod -Uri ($ApiBase + '/api/projects/' + $project.id) -WebSession $session -TimeoutSec 10
    if ($candidate.master -and $candidate.master.approval -and $candidate.master.approval.transfer -and $candidate.master.approval.transfer.status -eq 'acknowledged') {
        $bundle = $candidate
        break
    }
}

if (-not $bundle) {
    Check 'transferred project' $false 'Aucun projet avec transfert confirme'
    Write-Output 'V0_VERIFY_FAIL'
    exit 1
}

$projectId = $bundle.project.id
Check 'project transferred' ($bundle.project.status -eq 'transferred') ($bundle.project.title + ' / ' + $bundle.project.status)
Check 'five scenes' (@($bundle.scenes).Count -eq 5) ('count=' + @($bundle.scenes).Count)
Check 'master exists' ($null -ne $bundle.master) ('version=' + $bundle.master.version)
Check 'qa pass' ($bundle.master.qaStatus -eq 'PASS') ('qa=' + $bundle.master.qaStatus)
Check 'two master versions' (@($bundle.masterVersions).Count -ge 2) ('count=' + @($bundle.masterVersions).Count)
Check 'approval exists' ($null -ne $bundle.master.approval) ('id=' + $bundle.master.approval.id)
Check 'transfer acknowledged' ($bundle.master.approval.transfer.status -eq 'acknowledged') ('status=' + $bundle.master.approval.transfer.status)
Check 'postiz mock' ($bundle.master.approval.transfer.provider -eq 'postiz-mock') ('provider=' + $bundle.master.approval.transfer.provider)

$scene3 = $bundle.scenes | Where-Object { $_.sceneKey -eq 'SCENE-003' }
Check 'scene-003 versioned' (@($scene3.versions).Count -ge 2) ('versions=' + @($scene3.versions).Count)

$artifactRoot = Join-Path $rootPath 'data/artifacts'
foreach ($scene in $bundle.scenes) {
    $latest = $scene.versions[0]
    $file = Join-Path $artifactRoot $latest.imagePath
    $exists = Test-Path -LiteralPath $file
    $size = if ($exists) { (Get-Item -LiteralPath $file).Length } else { 0 }
    Check ('png ' + $scene.sceneKey) ($exists -and $size -gt 10000) ('bytes=' + $size + ' version=' + $latest.version)
}

$masterFile = Join-Path $artifactRoot $bundle.master.masterPath
Check 'master file exists' (Test-Path -LiteralPath $masterFile) $bundle.master.masterPath
$ffmpegLine = $envLines | Where-Object { $_ -like 'FFMPEG_PATH=*' } | Select-Object -First 1
$ffmpeg = if ($ffmpegLine) { $ffmpegLine.Substring('FFMPEG_PATH='.Length) } else { 'ffmpeg' }
if (Test-Path -LiteralPath $ffmpeg) {
    $probe = & $ffmpeg -hide_banner -i $masterFile 2>&1 | Out-String
    Check 'mp4 1080x1920' ($probe -match '1080x1920') 'parsed from ffmpeg'
    Check 'mp4 h264' ($probe -match 'h264') 'parsed from ffmpeg'
    Check 'mp4 aac' ($probe -match 'aac') 'parsed from ffmpeg'
    Check 'mp4 10s' ($probe -match 'Duration: 00:00:10') 'parsed from ffmpeg'
} else {
    Check 'ffmpeg available' $false 'ffmpeg path introuvable'
}

if ($failures.Count -gt 0) {
    Write-Output ('V0_VERIFY_FAIL: ' + $failures.Count + ' echec(s) sur ' + $checks + ' controle(s).')
    exit 1
}

Write-Output ('V0_VERIFY_PASS: ' + $checks + ' controles, projet ' + $projectId)
exit 0
