#requires -Version 7.0
<#
.SYNOPSIS
    Scan de secrets du depot Vululu AI : arbre de travail et, en option, historique Git.

.DESCRIPTION
    Mode par defaut (sans -History) : parcourt les fichiers texte du depot (suivis
    ou non, hors fichiers ignores et binaires) et signale les motifs a forte
    confiance de cles ou identifiants. N'affiche jamais la valeur detectee,
    seulement le fichier, la ligne et le nom du motif.

    Mode -History : execute le scan de l'arbre de travail PUIS parcourt toutes les
    revisions de l'historique atteignables depuis HEAD (git rev-list HEAD) pour
    detecter un secret qui aurait ete commite puis retire. Ce mode n'est fiable
    que sur un clone complet ; un depot peu profond (shallow) est refuse avec le
    code 2 plutot que de produire un faux PASS. En CI : actions/checkout avec
    fetch-depth: 0 obligatoire.

    Portabilite : PowerShell 7 sur Windows et Linux (aucun chemin Windows ni
    binaire specifique). Utilise git et les cmdlets .NET multiplateformes.

    Code de sortie : 0 si aucun secret, 1 si detection, 2 si le mode historique
    ne peut pas etre execute de facon fiable.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/).

.PARAMETER History
    Etend le scan a l'historique Git (necessite un clone complet).

.EXAMPLE
    pwsh -NoProfile -File scripts/check-secrets.ps1

.EXAMPLE
    pwsh -NoProfile -File scripts/check-secrets.ps1 -History
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$History
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path

$skipDirs = @('.git', '_inbox', 'node_modules', '.pnpm-store', 'dist', 'build', 'coverage', '.v0', 'data', '.next', 'test-results', 'playwright-report', 'blob-report')
$binaryExtensions = @(
    '.docx', '.doc', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp',
    '.mp4', '.mov', '.mp3', '.wav', '.zip', '.ico', '.woff', '.woff2',
    '.ttf', '.otf', '.xlsx', '.xls', '.pptx', '.sqlite', '.db', '.exe',
    '.dll', '.bin', '.pyc'
)

# Motifs communs a l'arbre de travail et a l'historique. Les motifs sont ecrits
# en .NET (Select-String) ; pour l'historique ils sont envoyes a 'git grep -E'
# (POSIX ERE) apres retrait d'un eventuel prefixe (?i), remplace par -i.
$patterns = @(
    @{ Name = 'private-key';       Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ Name = 'aws-access-key';    Regex = 'AKIA[0-9A-Z]{16}' },
    @{ Name = 'aws-temp-key';      Regex = 'ASIA[0-9A-Z]{16}' },
    @{ Name = 'github-token';      Regex = 'gh[pousr]_[A-Za-z0-9]{36,}' },
    @{ Name = 'github-pat';        Regex = 'github_pat_[A-Za-z0-9_]{60,}' },
    @{ Name = 'openai-key';        Regex = 'sk-[A-Za-z0-9]{32,}' },
    @{ Name = 'anthropic-key';     Regex = 'sk-ant-[A-Za-z0-9_-]{20,}' },
    @{ Name = 'google-api-key';    Regex = 'AIza[0-9A-Za-z_-]{35}' },
    @{ Name = 'slack-token';       Regex = 'xox[baprs]-[A-Za-z0-9-]{10,}' },
    @{ Name = 'jwt';               Regex = 'eyJ[A-Za-z0-9_-]{20,}[.][A-Za-z0-9_-]{20,}[.][A-Za-z0-9_-]{20,}' },
    @{ Name = 'assigned-secret';   Regex = '(?i)(api[_-]?key|secret|password|passwd|token)[ ]*[:=][ ]*[A-Za-z0-9_+/=-]{24,}' }
)

function Write-Finding {
    param(
        [string]$Pattern,
        [string]$File,
        [int]$Line,
        [string]$Commit = ''
    )
    if ([string]::IsNullOrEmpty($Commit)) {
        Write-Output ('FINDING pattern=' + $Pattern + ' file=' + $File + ' line=' + $Line)
    } else {
        Write-Output ('HISTORY_FINDING pattern=' + $Pattern + ' commit=' + $Commit + ' file=' + $File + ' line=' + $Line)
    }
}

# ---------------------------------------------------------------------------
# 1. Arbre de travail : fichiers suivis + non suivis non ignores.
# ---------------------------------------------------------------------------
$trackedFiles = & git -C $rootPath ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) {
    Write-Output 'SECRET_SCAN_ERROR: git ls-files a echoue (depot Git attendu).'
    exit 2
}
$files = foreach ($relative in $trackedFiles) {
    if ([string]::IsNullOrWhiteSpace($relative)) { continue }
    $full = Join-Path $rootPath $relative
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }
    $item = Get-Item -LiteralPath $full
    if ($item.Name -eq '.env' -or ($item.Name -like '.env.*' -and $item.Name -ne '.env.example')) { continue }
    if ($binaryExtensions -contains $item.Extension.ToLowerInvariant()) { continue }
    $item
}

$findings = New-Object System.Collections.Generic.List[object]
foreach ($file in $files) {
    foreach ($pattern in $patterns) {
        $matches = Select-String -LiteralPath $file.FullName -Pattern $pattern.Regex -AllMatches -ErrorAction SilentlyContinue
        foreach ($match in $matches) {
            $relative = $file.FullName.Substring($rootPath.Length).TrimStart([char]47, [char]92)
            $findings.Add([pscustomobject]@{
                Pattern = $pattern.Name
                File    = $relative
                Line    = $match.LineNumber
                Commit  = ''
            })
        }
    }
}

Write-Output ('SCAN_ROOT=' + $rootPath)
Write-Output ('SCAN_FILES=' + @($files).Count)
if ($findings.Count -gt 0) {
    Write-Output ('SECRET_SCAN_FAIL: ' + $findings.Count + ' detection(s) dans l arbre de travail.')
    foreach ($finding in $findings) {
        Write-Finding -Pattern $finding.Pattern -File $finding.File -Line $finding.Line
    }
    exit 1
}
Write-Output 'SECRET_SCAN_PASS: aucun secret detecte dans l arbre de travail.'

if (-not $History) {
    exit 0
}

# ---------------------------------------------------------------------------
# 2. Historique Git : un seul 'git grep' par lot de revisions, motifs combines.
#    La sortie de git grep contient le contenu des lignes : elle n'est jamais
#    affichee, seuls le depot, le fichier et le numero de ligne sont publies.
# ---------------------------------------------------------------------------
$shallow = (& git -C $rootPath rev-parse --is-shallow-repository 2>$null)
if ($LASTEXITCODE -ne 0) {
    Write-Output 'SECRET_HISTORY_SCAN_BLOCKED: git rev-parse --is-shallow-repository a echoue.'
    exit 2
}
if (('' + $shallow).Trim() -ne 'false') {
    Write-Output 'SECRET_HISTORY_SCAN_BLOCKED: depot peu profond (shallow). Utiliser actions/checkout avec fetch-depth: 0.'
    exit 2
}

$revs = @(& git -C $rootPath rev-list HEAD 2>$null)
if ($LASTEXITCODE -ne 0 -or $revs.Count -eq 0) {
    Write-Output 'SECRET_HISTORY_SCAN_BLOCKED: git rev-list HEAD a echoue ou aucune revision trouvee.'
    exit 2
}

$combinedParts = foreach ($pattern in $patterns) {
    $expression = $pattern.Regex
    if ($expression.StartsWith('(?i)')) { $expression = $expression.Substring(4) }
    '(' + $expression + ')'
}
$combined = $combinedParts -join '|'

$historyFindings = New-Object System.Collections.Generic.List[object]
$unparsed = 0
$chunkSize = 100
for ($offset = 0; $offset -lt $revs.Count; $offset += $chunkSize) {
    $last = [Math]::Min($offset + $chunkSize - 1, $revs.Count - 1)
    $chunk = $revs[$offset..$last]
    $gitArgs = @('-C', $rootPath, 'grep', '-I', '-n', '-i', '-E', '-e', $combined)
    $raw = @(& git @gitArgs @chunk '--' 2>$null)
    $grepExit = $LASTEXITCODE
    if ($grepExit -gt 1) {
        Write-Output ('SECRET_HISTORY_SCAN_BLOCKED: git grep a echoue (exit=' + $grepExit + ').')
        exit 2
    }
    foreach ($line in $raw) {
        if ($line -match '^([0-9a-f]{40}):(.+?):([0-9]+):(.*)$') {
            $commit = $Matches[1]
            $file = $Matches[2]
            $lineNumber = [int]$Matches[3]
            $content = $Matches[4]
            foreach ($pattern in $patterns) {
                if ($content -match $pattern.Regex) {
                    $historyFindings.Add([pscustomobject]@{
                        Pattern = $pattern.Name
                        File    = $file
                        Line    = $lineNumber
                        Commit  = $commit.Substring(0, 12)
                    })
                    break
                }
            }
        } else {
            $unparsed++
        }
    }
}

Write-Output ('HISTORY_SCAN_REVS=' + $revs.Count)
if ($unparsed -gt 0) {
    Write-Output ('SECRET_HISTORY_SCAN_BLOCKED: ' + $unparsed + ' ligne(s) de sortie git grep illisible(s) ; scan non fiable.')
    exit 2
}
if ($historyFindings.Count -gt 0) {
    Write-Output ('SECRET_HISTORY_SCAN_FAIL: ' + $historyFindings.Count + ' detection(s) dans l historique.')
    foreach ($finding in $historyFindings) {
        Write-Finding -Pattern $finding.Pattern -File $finding.File -Line $finding.Line -Commit $finding.Commit
    }
    exit 1
}
Write-Output 'SECRET_HISTORY_SCAN_PASS: aucun secret detecte dans l historique atteignable depuis HEAD.'
exit 0
