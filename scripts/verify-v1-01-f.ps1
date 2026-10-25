param(
  [switch]$SkipTests,
  [switch]$IncludeTests = $true
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  $failed = @()
  function Step([string]$name, [scriptblock]$action) {
    Write-Output ('=== ' + $name + ' ===')
    try { & $action; if ($LASTEXITCODE -ne 0) { $failed += $name } }
    catch { Write-Output ('FAIL ' + $name + ': ' + $_.Exception.Message); $failed += $name }
  }
  Step 'secrets' { pwsh -NoProfile -File scripts/check-secrets.ps1; $global:LASTEXITCODE = $LASTEXITCODE }
  Step 'docs' { pwsh -NoProfile -File scripts/verify-foundation-docs.ps1 }
  Step 'typecheck' { pnpm typecheck }
  Step 'lint-strict' { $env:LINT_STRICT = '1'; pnpm lint }
  if (-not $SkipTests) {
    Step 'tests' { pnpm test }
  } else {
    Write-Output 'NOT_RUN tests (-SkipTests)'
  }
  Step 'build' { pnpm build }
  if ($failed.Count -gt 0) {
    Write-Output ('V1_01_F_GATE_FAIL: ' + ($failed -join ','))
    exit 1
  }
  Write-Output 'V1_01_F_GATE_PASS'
}
finally { Pop-Location }
