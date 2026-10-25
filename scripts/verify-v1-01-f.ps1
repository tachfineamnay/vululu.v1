param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  Write-Output '=== secrets ==='
  pwsh -NoProfile -File scripts/check-secrets.ps1
  if ($LASTEXITCODE -ne 0) { throw 'secrets' }
  Write-Output '=== docs ==='
  pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
  if ($LASTEXITCODE -ne 0) { throw 'docs' }
  Write-Output '=== typecheck ==='
  pnpm typecheck
  if ($LASTEXITCODE -ne 0) { throw 'typecheck' }
  Write-Output '=== lint-strict ==='
  $env:LINT_STRICT = '1'
  pnpm lint
  if ($LASTEXITCODE -ne 0) { throw 'lint' }
  if ($SkipTests) {
    Write-Output '=== tests NOT_RUN (-SkipTests) ==='
  } else {
    Write-Output '=== tests ==='
    pnpm test
    if ($LASTEXITCODE -ne 0) { throw 'tests' }
  }
  Write-Output '=== build ==='
  pnpm build
  if ($LASTEXITCODE -ne 0) { throw 'build' }
  Write-Output 'V1_01_F_GATE_PASS'
}
catch {
  Write-Output ('V1_01_F_GATE_FAIL: ' + $_.Exception.Message)
  exit 1
}
finally { Pop-Location }
