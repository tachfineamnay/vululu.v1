param(
    [ValidateSet('init', 'start', 'stop', 'status')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pgBin = 'D:/pgportable/pgsql/bin'
$port = 55432
$user = 'vululu'
$data = Join-Path $root '.v0/pgdata'
$log = Join-Path $root '.v0/pg.log'
$dbs = @('vululu_v0', 'vululu_v0_test')

if (-not (Test-Path (Join-Path $pgBin 'postgres.exe'))) {
    throw 'PostgreSQL portable introuvable: ' + $pgBin
}

New-Item -ItemType Directory -Force -Path (Join-Path $root '.v0') | Out-Null

function Test-Pg {
    & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $port -q | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Start-Pg {
    if (Test-Pg) {
        Write-Output ('PostgreSQL deja actif sur le port ' + $port)
        return
    }
    & (Join-Path $pgBin 'pg_ctl.exe') -D $data -l $log -o ('-p ' + $port + ' -h 127.0.0.1') -w start
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL n a pas demarre. Voir ' + $log
    }
    Write-Output ('PostgreSQL demarre sur le port ' + $port)
}

function Ensure-Db([string]$Name) {
    $sql = "SELECT 1 FROM pg_database WHERE datname='" + $Name + "'"
    $out = & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p $port -U $user -d postgres -tAc $sql
    if (($out | Out-String).Trim() -ne '1') {
        & (Join-Path $pgBin 'psql.exe') -h 127.0.0.1 -p $port -U $user -d postgres -c ('CREATE DATABASE ' + $Name) | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw ('Creation de la base impossible: ' + $Name)
        }
        Write-Output ('Base creee: ' + $Name)
    }
}

function Init-Pg {
    if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $data) | Out-Null
        & (Join-Path $pgBin 'initdb.exe') -D $data -U $user -A trust --encoding=UTF8
        if ($LASTEXITCODE -ne 0) {
            throw 'initdb a echoue.'
        }
    }
    Start-Pg
    foreach ($db in $dbs) {
        Ensure-Db $db
    }
}

switch ($Action) {
    'init' {
        Init-Pg
    }
    'start' {
        if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
            throw 'Cluster V0 non initialise. Lancer: pwsh scripts/dev-db.ps1 init'
        }
        Start-Pg
        foreach ($db in $dbs) {
            Ensure-Db $db
        }
    }
    'stop' {
        if (Test-Pg) {
            & (Join-Path $pgBin 'pg_ctl.exe') -D $data -w stop
            Write-Output 'PostgreSQL arrete.'
        } else {
            Write-Output 'PostgreSQL deja arrete.'
        }
    }
    'status' {
        if (Test-Pg) {
            Write-Output 'RUNNING'
        } else {
            Write-Output 'STOPPED'
        }
    }
}
