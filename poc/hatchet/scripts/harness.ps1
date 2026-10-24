$ErrorActionPreference = 'Stop'
$PocRoot = Split-Path -Parent $PSScriptRoot
$Tsx = Join-Path $PocRoot 'node_modules/.bin/tsx.cmd'
$HandshakePath = '/tmp/hatchet-poc-handshake.json'

function Set-PocEnv {
  $raw = wsl -d docker-desktop -e cat $HandshakePath 2>&1
  $hs = $raw | ConvertFrom-Json
  $env:HATCHET_CLIENT_TOKEN = $hs.token
  $env:HATCHET_CLIENT_HOST_PORT = '127.0.0.1:7077'
  $env:HATCHET_CLIENT_API_URL = 'http://127.0.0.1:28243'
  $env:HATCHET_CLIENT_TLS_STRATEGY = 'none'
  $env:HATCHET_CLIENT_LOG_LEVEL = 'INFO'
  $env:POC_DATABASE_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_hatchet_poc?sslmode=disable'
}

function Start-PocWorker {
  Set-PocEnv
  $out = Join-Path $PocRoot 'worker.out.log'
  $err = Join-Path $PocRoot 'worker.err.log'
  $proc = Start-Process -FilePath $Tsx -ArgumentList 'src/worker.ts' -WorkingDirectory $PocRoot -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
  $proc.Id | Set-Content (Join-Path $PocRoot 'worker.pid')
  Start-Sleep -Seconds 8
  if ($proc.HasExited) { throw 'worker_exited' }
  Write-Output ('WORKER_PID=' + $proc.Id)
}

function Stop-PocWorker {
  $pidFile = Join-Path $PocRoot 'worker.pid'
  if (-not (Test-Path $pidFile)) { Write-Output 'NO_WORKER_PID'; return }
  $parentPid = [int](Get-Content $pidFile)
  $workers = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src/worker.ts' }
  foreach ($worker in $workers) { Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'worker.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $parentPid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Write-Output ('WORKER_STOPPED=' + $parentPid)
}

function Wait-PocEffect {
  param([string]$RunId, [string]$SceneKey, [int]$TimeoutSeconds = 120)
  $pg = 'D:/pgportable/pgsql/bin/psql.exe'
  $started = Get-Date
  while (((Get-Date) - $started).TotalSeconds -lt $TimeoutSeconds) {
    $key = 'scene:' + $RunId + ':' + $SceneKey
    $count = & $pg -h 127.0.0.1 -p 55432 -U vululu -d vululu_hatchet_poc -tAc "SELECT count(*) FROM poc_effect WHERE idempotency_key='$key'" 2>$null
    if ([int]$count -ge 1) { Write-Output ('EFFECT_PRESENT=' + $key); return }
    Start-Sleep -Seconds 1
  }
  throw 'effect_timeout'
}

function Invoke-PocDriver {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  Set-PocEnv
  & $Tsx 'src/driver.ts' @Args 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'driver_failed' }
}

function Poc-Psql {
  param([string]$Sql)
  $pg = 'D:/pgportable/pgsql/bin/psql.exe'
  & $pg -h 127.0.0.1 -p 55432 -U vululu -d vululu_hatchet_poc -c $Sql 2>&1
}
