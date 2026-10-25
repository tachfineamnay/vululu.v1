#requires -Version 7.0
<#
.SYNOPSIS
    Controle des fichiers suivis par Git (hygiene du depot) et des chemins
    personnels absolus dans les fichiers versionnes.

.DESCRIPTION
    Verifie sur la liste 'git ls-files' :
      - aucun fichier .env (seul .env.example est autorise) ;
      - aucun node_modules, data/, .v0/, .v1/, test-results/, playwright-report/,
        blob-report/, secrets/, credentials/ ;
      - aucun binaire local (*.sqlite, *.sqlite3, *.db, *.log) ;
      - aucun secret/certificat (*.pem, *.key, *.p12, *.pfx, *.crt, *.cer).

    Puis, hors documentation (docs/) :
      - aucun chemin absolu personnel Windows (lettre de lecteur suivie de
        Users/ ou Desktop/)
        ne doit apparaitre dans le contenu des fichiers texte versionnes.

    Les chemins absolus de machine de travail sont toleres dans docs/ (ils
    documentent un environnement historique), jamais dans le code ou la CI.

    Portabilite : PowerShell 7 Linux/Windows ; utilise git et les cmdlets .NET.
    Code de sortie : 0 si le depot est propre, 1 sinon.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/).
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]

$tracked = @(& git -C $rootPath ls-files)
if ($LASTEXITCODE -ne 0) {
    Write-Output 'TRACKED_FILES_ERROR: git ls-files a echoue (depot Git attendu).'
    exit 2
}
if ($tracked.Count -eq 0) {
    $failures.Add('TRACKED_FILES_EMPTY aucun fichier suivi')
}

foreach ($path in $tracked) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    $label = $null
    if ($path -match '(^|/)[.]env$' -or ($path -match '(^|/)[.]env[.]' -and $path -notmatch '[.]env[.]example$')) {
        $label = 'FORBIDDEN_ENV_FILE'
    } elseif ($path -match '(^|/)node_modules/') {
        $label = 'FORBIDDEN_NODE_MODULES'
    } elseif ($path -match '^data/') {
        $label = 'FORBIDDEN_LOCAL_DATA'
    } elseif ($path -match '(^|/)[.]v[01]/') {
        $label = 'FORBIDDEN_LOCAL_RUNTIME'
    } elseif ($path -match '(^|/)(test-results|playwright-report|blob-report)/') {
        $label = 'FORBIDDEN_TEST_OUTPUT'
    } elseif ($path -match '(^|/)(secrets|credentials)/') {
        $label = 'FORBIDDEN_SECRETS_DIR'
    } elseif ($path -match '[.](sqlite|sqlite3|db|log)$') {
        $label = 'FORBIDDEN_LOCAL_BINARY_OR_LOG'
    } elseif ($path -match '[.](pem|key|p12|pfx|crt|cer)$') {
        $label = 'FORBIDDEN_SECRET_FILE'
    }
    if ($null -ne $label) {
        $failures.Add($label + ' ' + $path)
    }
}

$binaryExtensions = @(
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.mov', '.mp3',
    '.wav', '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.zip', '.gz',
    '.woff', '.woff2', '.ttf', '.otf', '.exe', '.dll', '.bin', '.pyc'
)
$personalPathPattern = '(?i)[A-Za-z]:[\\/]+(Users|Desktop)[\\/]'
$contentScanned = 0
foreach ($path in $tracked) {
    if ([string]::IsNullOrWhiteSpace($path)) { continue }
    if ($path -match '^docs/') { continue }
    $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($binaryExtensions -contains $extension) { continue }
    $full = Join-Path $rootPath $path
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $full
    if ($item.Length -gt 2MB) { continue }
    $contentScanned++
    $matches = @(Select-String -LiteralPath $full -Pattern $personalPathPattern -ErrorAction SilentlyContinue)
    if ($matches.Count -gt 0) {
        $failures.Add('PERSONAL_ABSOLUTE_PATH ' + $path + ' lines=' + $matches.Count)
    }
}

Write-Output ('TRACKED_FILES=' + $tracked.Count)
Write-Output ('TRACKED_CONTENT_SCANNED=' + $contentScanned)
if ($failures.Count -gt 0) {
    Write-Output ('TRACKED_CHECK_FAIL: ' + $failures.Count + ' probleme(s).')
    foreach ($failure in $failures) {
        Write-Output ('FAIL ' + $failure)
    }
    exit 1
}
Write-Output 'TRACKED_CHECK_PASS: aucun fichier interdit suivi, aucun chemin personnel absolu hors docs/.'
exit 0
