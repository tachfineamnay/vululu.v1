#requires -Version 7.0
<#
.SYNOPSIS
    Scan de secrets pour le depot Vululu AI.
.DESCRIPTION
    Parcourt les fichiers texte du depot (hors .git, _inbox, binaires) et signale
    les motifs a forte confiance de cles ou identifiants. N'affiche jamais la valeur
    detectee, seulement le fichier, la ligne et le nom du motif.
    Code de sortie : 0 si aucun secret, 1 si detection.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
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

$trackedFiles = & git -C $rootPath ls-files --cached --others --exclude-standard
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
            $findings.Add([pscustomobject]@{
                Pattern = $pattern.Name
                File    = $file.FullName.Substring($rootPath.Length).TrimStart([char]47)
                Line    = $match.LineNumber
            })
        }
    }
}

Write-Output ('SCAN_ROOT=' + $rootPath)
Write-Output ('SCAN_FILES=' + @($files).Count)
if ($findings.Count -eq 0) {
    Write-Output 'SECRET_SCAN_PASS: aucun secret detecte.'
    exit 0
}

Write-Output ('SECRET_SCAN_FAIL: ' + $findings.Count + ' detection(s).')
foreach ($finding in $findings) {
    Write-Output ('FINDING pattern=' + $finding.Pattern + ' file=' + $finding.File + ' line=' + $finding.Line)
}
exit 1
