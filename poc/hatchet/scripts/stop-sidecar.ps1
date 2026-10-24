$ErrorActionPreference = 'SilentlyContinue'
$pidFile = Join-Path $PSScriptRoot '../sidecar.pid'
if (Test-Path $pidFile) {
  $pid = [int](Get-Content $pidFile)
  Stop-Process -Id $pid -Force
  Remove-Item $pidFile -Force
}
wsl -d docker-desktop -e sh -c 'pkill -f hatchet-embedded-sidecar || true' 2>&1 | Out-Null
Write-Output 'SIDECAR_STOPPED'
