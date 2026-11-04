# Applies this design update to the installed site on this computer. Pages, design and the
# application are replaced; the client's catalog, enquiries, orders, contact details and
# accounts are kept.
#   Double-click update.cmd, or: powershell -ExecutionPolicy Bypass -File update.ps1 [-Target <installed folder>]
param([string]$Target)
# Docker writes progress to stderr; exit codes are checked explicitly instead.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Say($text) { Write-Host ""; Write-Host $text -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }
function Get-Value($file, $key) {
  $line = Get-Content -LiteralPath $file | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if ($line) { return $line.Substring($key.Length + 1) } else { return '' }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker Desktop is not installed.' }
docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running. Start Docker Desktop and try again.' }
$updEnv = Join-Path $PSScriptRoot 'update.env'
$slug = Get-Value $updEnv 'CELL_SLUG'
$project = "site-$slug"

if (-not $Target) {
  $found = (docker compose ls -a --format json | Out-String | ConvertFrom-Json) | Where-Object { $_.Name -eq $project } | Select-Object -First 1
  if ($found) { $Target = Split-Path -Parent (($found.ConfigFiles -split ',')[0]) }
}
if (-not $Target -or -not (Test-Path -LiteralPath (Join-Path $Target 'docker-compose.yml'))) { Fail 'The installed site was not found. Run: update.ps1 -Target <installed folder>' }
$targetEnv = Join-Path $Target '.env'
$compose = @('compose', '-p', $project, '--project-directory', $Target, '-f', (Join-Path $Target 'docker-compose.yml'))
Say "Updating $slug in $Target"

Say 'Loading the new application image'
docker load -i images/api.tar.gz
if ($LASTEXITCODE -ne 0) { Fail 'Could not load images/api.tar.gz.' }
$text = [System.IO.File]::ReadAllText($targetEnv) -replace '(?m)^API_IMAGE=.*$', "API_IMAGE=$(Get-Value $updEnv 'API_IMAGE')"
[System.IO.File]::WriteAllText($targetEnv, $text, $utf8)

Say 'Replacing the website files'
$siteDir = Join-Path $Target 'site'
if (Test-Path -LiteralPath $siteDir) { Remove-Item -LiteralPath $siteDir -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'site') -Destination $siteDir -Recurse

Say 'Restarting with the new version'
docker @compose up -d
Write-Host -NoNewline 'Waiting for the site to start'
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  if ((docker @compose logs api 2>$null) -match 'API listening') { $ready = $true; break }
  Write-Host -NoNewline '.'; Start-Sleep -Seconds 2
}
Write-Host ''
if (-not $ready) { Fail "The site did not start. Logs: docker compose -p $project logs api" }

Say 'Applying the new design'
# cmd redirection keeps the files byte-for-byte (PowerShell pipes would re-encode them).
$composeLine = "docker compose -p $project --project-directory `"$Target`" -f `"$(Join-Path $Target 'docker-compose.yml')`""
cmd /c "$composeLine exec -T api sh -c `"tar -xzf - -C /data/uploads`" < `"$(Join-Path $PSScriptRoot 'data\files.tar.gz')`""
if ($LASTEXITCODE -ne 0) { Fail 'Could not copy the new files.' }
$db = ((docker @compose exec -T db psql -U sb_admin -d sb_control -tAc "SELECT db_name FROM tenants WHERE slug = '$slug'") | Out-String).Trim()
if (-not $db) { Fail "The site's database was not found." }
$sql = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'data\design.sql')).Replace((Get-Value $updEnv 'OLD_SITE_URL'), (Get-Value $targetEnv 'SITE_URL'))
$tmp = Join-Path $env:TEMP "design-$slug.sql"
[System.IO.File]::WriteAllText($tmp, $sql, $utf8)
cmd /c "$composeLine exec -T db psql -U sb_admin -d $db -v ON_ERROR_STOP=1 -q < `"$tmp`" > nul"
$applied = $LASTEXITCODE
Remove-Item -LiteralPath $tmp -Force
if ($applied -ne 0) { Fail 'Could not apply the new design.' }
docker @compose up -d --force-recreate proxy *> $null

$siteUrl = Get-Value $targetEnv 'SITE_URL'
$httpsNote = if ((Get-Value $targetEnv 'DOMAIN') -eq ':80') { ' (not used without a domain)' } else { '' }
Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host ' Update applied' -ForegroundColor Green
Write-Host ''
Write-Host " Site     $siteUrl"
Write-Host " Admin    $siteUrl/admin"
Write-Host ''
Write-Host ' Ports on this computer'
Write-Host "   $(Get-Value $targetEnv 'HTTP_PORT')/tcp   HTTP  (site, admin, API)"
Write-Host "   $(Get-Value $targetEnv 'HTTPS_PORT')/tcp   HTTPS$httpsNote"
Write-Host '==================================================' -ForegroundColor Green
docker @compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
