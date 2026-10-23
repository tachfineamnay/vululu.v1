#requires -Version 7.0
<#
.SYNOPSIS
    Verifie la base V1-00 sans toucher a la base ou au cluster V0.
#>
[CmdletBinding()]
param([string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$pg = 'D:/pgportable/pgsql/bin'
$db = 'vululu_v1_00'
$ready = & (Join-Path $pg 'pg_isready.exe') -h 127.0.0.1 -p 55432 2>&1
Write-Output ('PG_READY=' + $ready)
$exists = & (Join-Path $pg 'psql.exe') -h 127.0.0.1 -p 55432 -U vululu -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>&1
if ([string]::IsNullOrWhiteSpace($exists) -or $exists.Trim() -ne '1') {
  Write-Output 'V1_DB_MISSING: copier vululu_v0 vers vululu_v1_00 selon le runbook.'
  exit 1
}
$count = & (Join-Path $pg 'psql.exe') -h 127.0.0.1 -p 55432 -U vululu -d $db -tAc 'SELECT count(*) FROM "Project"' 2>&1
Write-Output ('V1_DB=' + $db + ' PROJECTS=' + $count.Trim())
exit 0
