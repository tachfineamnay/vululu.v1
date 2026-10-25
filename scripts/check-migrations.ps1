#requires -Version 7.0
<#
.SYNOPSIS
    Validation structurelle des migrations Prisma versionnees.

.DESCRIPTION
    Verifie, sans connexion a une base :
      - presence du dossier packages/db/prisma/migrations et du schema Prisma ;
      - provider PostgreSQL declare dans schema.prisma ;
      - nombre de migrations >= minimum attendu au jalon (parametrable) ;
      - nom de dossier au format Prisma <horodatage 14 chiffres>_<snake_case> ;
      - presence d'un migration.sql non vide dans chaque dossier ;
      - absence de doublon d'horodatage.

    'prisma validate' (validation du schema) est execute separement dans le job
    security-architecture ; ce script ne remplace pas la validation Prisma.

    Portabilite : PowerShell 7 Linux/Windows, aucun chemin absolu de machine.
    Code de sortie : 0 si la structure est valide, 1 sinon.

.PARAMETER Root
    Racine du depot (par defaut le dossier parent de scripts/).

.PARAMETER MinimumMigrations
    Nombre minimal de migrations attendu. Valeur de reference au jalon
    V1-01-G : 12. Le nombre peut augmenter avec une migration legitime, jamais
    diminuer.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [int]$MinimumMigrations = 12
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path
$failures = New-Object System.Collections.Generic.List[string]

$migrationsDir = Join-Path $rootPath 'packages/db/prisma/migrations'
$schemaPath = Join-Path $rootPath 'packages/db/prisma/schema.prisma'

if (-not (Test-Path -LiteralPath $schemaPath -PathType Leaf)) {
    $failures.Add('MISSING packages/db/prisma/schema.prisma')
} else {
    $schema = Get-Content -LiteralPath $schemaPath -Raw
    if ($schema -notmatch 'provider\s*=\s*"postgresql"') {
        $failures.Add('SCHEMA_PROVIDER le provider PostgreSQL est attendu dans schema.prisma')
    }
}

$migrationDirs = @()
if (-not (Test-Path -LiteralPath $migrationsDir -PathType Container)) {
    $failures.Add('MISSING packages/db/prisma/migrations')
} else {
    $migrationDirs = @(Get-ChildItem -LiteralPath $migrationsDir -Directory | Sort-Object Name)
}

if ($migrationDirs.Count -lt $MinimumMigrations) {
    $failures.Add('MIGRATION_COUNT ' + $migrationDirs.Count + ' migration(s) < minimum ' + $MinimumMigrations)
}

$timestamps = @{}
foreach ($directory in $migrationDirs) {
    $name = $directory.Name
    $relative = 'packages/db/prisma/migrations/' + $name
    if ($name -notmatch '^(\d{14})_[a-z0-9_]+$') {
        $failures.Add('MIGRATION_NAME_FORMAT ' + $relative)
        continue
    }
    $stamp = $Matches[1]
    if ($timestamps.ContainsKey($stamp)) {
        $failures.Add('MIGRATION_TIMESTAMP_DUPLICATE ' + $stamp + ' (' + $timestamps[$stamp] + ', ' + $name + ')')
    } else {
        $timestamps[$stamp] = $name
    }
    $sqlPath = Join-Path $directory.FullName 'migration.sql'
    if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
        $failures.Add('MIGRATION_SQL_MISSING ' + $relative + '/migration.sql')
        continue
    }
    $sql = Get-Content -LiteralPath $sqlPath -Raw
    if ([string]::IsNullOrWhiteSpace($sql)) {
        $failures.Add('MIGRATION_SQL_EMPTY ' + $relative + '/migration.sql')
    }
}

Write-Output ('MIGRATIONS=' + $migrationDirs.Count)
Write-Output ('MIGRATIONS_MINIMUM=' + $MinimumMigrations)
if ($failures.Count -gt 0) {
    Write-Output ('MIGRATION_CHECK_FAIL: ' + $failures.Count + ' probleme(s).')
    foreach ($failure in $failures) {
        Write-Output ('FAIL ' + $failure)
    }
    exit 1
}
Write-Output 'MIGRATION_CHECK_PASS: dossiers de migration, migration.sql et schema Prisma coherents.'
exit 0
