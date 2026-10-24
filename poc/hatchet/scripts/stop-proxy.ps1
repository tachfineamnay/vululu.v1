$ErrorActionPreference = 'SilentlyContinue'
$pidFile = Join-Path $PSScriptRoot '../proxy.pid'
if (Test-Path $pidFile) {
  $pid = [int](Get-Content $pidFile)
  Stop-Process -Id $pid -Force
  Remove-Item $pidFile -Force
}
Write-Output 'PROXY_STOPPED'
