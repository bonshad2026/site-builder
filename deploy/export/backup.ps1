# Backs up this site: the whole database and the uploaded files, into backups\<date-time>\.
# Keeps the newest 14 backups (BACKUP_KEEP in .env to change). The installer schedules it every night.
#   powershell -ExecutionPolicy Bypass -File backup.ps1
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
function Get-EnvValue($key) {
  $line = Get-Content -LiteralPath '.env' | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if ($line) { return $line.Substring($key.Length + 1) } else { return '' }
}
$project = "site-$(Get-EnvValue 'CELL_SLUG')"
$keep = [int](Get-EnvValue 'BACKUP_KEEP'); if (-not $keep) { $keep = 14 }
$dir = Join-Path 'backups' (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# Binary-safe: the dumps are written inside the containers and copied out.
docker compose -p $project exec -T db sh -c 'pg_dumpall -U sb_admin --clean --if-exists | gzip > /tmp/db.sql.gz'
docker compose -p $project cp db:/tmp/db.sql.gz (Join-Path $dir 'db.sql.gz')
docker compose -p $project exec -T api sh -c 'cd /data/uploads && tar -czf /tmp/uploads.tar.gz .'
docker compose -p $project cp api:/tmp/uploads.tar.gz (Join-Path $dir 'uploads.tar.gz')
if (-not (Test-Path (Join-Path $dir 'db.sql.gz'))) { Write-Host 'backup failed' -ForegroundColor Red; exit 1 }
Write-Host "backup: $dir"

Get-ChildItem -Directory 'backups' | Sort-Object Name -Descending | Select-Object -Skip $keep | Remove-Item -Recurse -Force -Confirm:$false
