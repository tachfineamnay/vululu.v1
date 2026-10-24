$ErrorActionPreference = 'Stop'
$cmd = "ip -4 addr show eth0 | awk '/inet /{print `$2}' | cut -d/ -f1"
$ip = (wsl -d docker-desktop -e sh -c $cmd).Trim().Split(' ')[0]
if (-not $ip) { throw 'WSL IP introuvable.' }
$proxy = Join-Path $PSScriptRoot 'tcp-proxy.cjs'
$out = Join-Path $PSScriptRoot '../proxy.out.log'
$err = Join-Path $PSScriptRoot '../proxy.err.log'
$proc = Start-Process -FilePath 'node.exe' -ArgumentList @($proxy,$ip) -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
$proc.Id | Set-Content (Join-Path $PSScriptRoot '../proxy.pid')
Start-Sleep -Seconds 2
Write-Output ('PROXY_READY PID=' + $proc.Id + ' WSL_IP=' + $ip)
