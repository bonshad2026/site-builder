# Restores a studio backup made with studio-backup.sh: sites, data, files, packaging records,
# template photos and studio settings, then starts the studio. (Windows, Docker Desktop)
#   powershell -ExecutionPolicy Bypass -File deploy\backup\studio-restore.ps1 <studio-backup-….tar.gz> [-Replace]
# -Replace: delete this machine's existing studio data first (otherwise it refuses).
param([Parameter(Mandatory = $true)][string]$Backup, [switch]$Replace)
# Docker writes progress to stderr; exit codes are checked explicitly instead.
$ErrorActionPreference = 'Continue'
function Fail($text) { Write-Host $text -ForegroundColor Red; exit 1 }

$Backup = (Resolve-Path -LiteralPath $Backup).Path
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $repo
$composeFile = Join-Path $repo 'deploy\docker-compose.yml'

docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running. Start Docker Desktop and try again.' }
docker volume inspect site-builder_studio-pgdata *> $null
if ($LASTEXITCODE -eq 0) {
  if (-not $Replace) { Fail 'This machine already has studio data. Run again with -Replace to delete it and restore the backup.' }
  Write-Host 'removing the existing studio data...'
  docker compose -f $composeFile down -v
}

$work = Join-Path $env:TEMP ("studio-restore-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
try {
  tar -xzf $Backup -C $work
  if ($LASTEXITCODE -ne 0) { Fail 'Could not open the backup file.' }
  $src = (Get-ChildItem -LiteralPath $work -Directory | Select-Object -First 1).FullName

  Write-Host 'settings...'
  $envFile = Join-Path $repo 'deploy\.env'
  if (Test-Path -LiteralPath $envFile) { Copy-Item -LiteralPath $envFile -Destination "$envFile.before-restore" -Force }
  # Same secrets as the original studio (they unlock the site databases); exports go to this machine's folder.
  $text = [System.IO.File]::ReadAllText((Join-Path $src 'studio.env')) -replace '(?m)^EXPORT_DIR=.*$', 'EXPORT_DIR=../exports'
  [System.IO.File]::WriteAllText($envFile, $text, (New-Object System.Text.UTF8Encoding($false)))
  New-Item -ItemType Directory -Force -Path (Join-Path $repo 'var'), (Join-Path $repo 'exports') | Out-Null
  tar -xzf (Join-Path $src 'demo-images.tar.gz') -C (Join-Path $repo 'var')

  Write-Host 'databases...'
  docker compose -f $composeFile up -d studio-db
  for ($i = 0; $i -lt 60; $i++) { docker exec sb-studio-db pg_isready -h 127.0.0.1 -U sb_admin *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 2 }
  # cmd redirection keeps the files byte-for-byte (PowerShell pipes would re-encode them).
  cmd /c "docker exec -i sb-studio-db psql -U sb_admin -d postgres -v ON_ERROR_STOP=0 -q < `"$(Join-Path $src 'studio-db.sql')`" > nul 2>&1"

  Write-Host 'building and starting the studio (the first build takes a few minutes)...'
  docker compose -f $composeFile up -d --build
  if ($LASTEXITCODE -ne 0) { Fail 'The studio could not be started.' }
  Write-Host 'files...'
  cmd /c "docker exec -i sb-studio-api tar -xzf - -C /data/uploads < `"$(Join-Path $src 'uploads.tar.gz')`""
  cmd /c "docker exec -i sb-control tar -xzf - -C /data < `"$(Join-Path $src 'control-data.tar.gz')`""
  docker restart sb-control *> $null
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Restored. Studio: http://admin.localhost  (sign in with the same account as on the original machine)' -ForegroundColor Green
docker exec sb-studio-db psql -U sb_admin -d sb_control -tAc "SELECT ' - ' || slug || '  http://' || slug || '.preview.localhost' FROM tenants WHERE status = 'active' ORDER BY created_at"
