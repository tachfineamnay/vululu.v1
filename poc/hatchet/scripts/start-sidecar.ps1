$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$Sidecar = Join-Path $RepoRoot '.v1/hatchet-embedded/hatchet-embedded-sidecar_v0.110.5_linux_amd64'
if (-not (Test-Path -LiteralPath $Sidecar)) {
  throw 'Sidecar absent. Telecharger v0.110.5 et verifier le SHA-256 (voir V1_01_C_OPERATIONS.md).'
}
$WslSidecar = '/mnt/host/c' + ($Sidecar -replace '^C:', '') -replace '\\','/'
$DataDir = '/mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-pg'
$HomeDir = '/mnt/host/c/Users/hp/Desktop/vululu-ai-v1-00/.v1/hatchet-poc-home'

wsl -d docker-desktop -e sh -c "id hatchet >/dev/null 2>&1 || adduser -D -h $HomeDir hatchet" 2>&1 | Out-Null
wsl -d docker-desktop -e sh -c "mkdir -p $HomeDir $DataDir; chown -R hatchet:hatchet $HomeDir $DataDir" 2>&1 | Out-Null
wsl -d docker-desktop -e sh -c "rm -f /tmp/hatchet-poc-handshake.json"

$command = "sleep 2147483647 | $WslSidecar -api-port 28243 -grpc-port 7077 -postgres-data-dir $DataDir -handshake-file /tmp/hatchet-poc-handshake.json -log-level info"
$proc = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d','docker-desktop','-u','hatchet','-e','sh','-c',$command) -PassThru -WindowStyle Hidden
$proc.Id | Set-Content (Join-Path $PSScriptRoot '../sidecar.pid')
$ready = $false
for ($i = 0; $i -lt 240; $i++) {
  Start-Sleep -Seconds 1
  try {
    $content = wsl -d docker-desktop -e cat /tmp/hatchet-poc-handshake.json 2>$null
    if ($content) { $ready = $true; break }
  } catch {}
}
if (-not $ready) { throw 'Sidecar non pret (handshake absent).' }
Write-Output ('SIDECAR_READY PID=' + $proc.Id)
