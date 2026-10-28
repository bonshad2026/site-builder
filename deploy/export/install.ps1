# Installs this site package on Windows (Docker Desktop required). Safe to re-run.
#   Double-click install.cmd, or: powershell -ExecutionPolicy Bypass -File install.ps1 [-Yes]
#   -Yes: no questions; installs on this computer without a domain, on the first free port from 8090.
param([switch]$Yes)
# Docker writes progress to stderr; exit codes are checked explicitly instead.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env'

function Say($text) { Write-Host ""; Write-Host $text -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host $text -ForegroundColor Red; exit 1 }
function Get-EnvValue($key) {
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
  if ($line) { return $line.Substring($key.Length + 1) } else { return '' }
}
function Set-EnvValue($key, $value) {
  $lines = [System.IO.File]::ReadAllText($envFile) -split "`r?`n"
  $found = $false
  $lines = $lines | ForEach-Object { if ($_ -match "^$key=") { $found = $true; "$key=$value" } else { $_ } }
  if (-not $found) { $lines = @($lines) + "$key=$value" }
  # LF line endings, no BOM: read as-is by docker compose.
  [System.IO.File]::WriteAllText($envFile, (($lines -join "`n").TrimEnd("`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}
function Test-PortBusy($port) { [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) }
function Get-FreePort($start) { $p = [int]$start; while (Test-PortBusy $p) { $p++ }; return $p }
function Ask($prompt, $default) {
  if ($Yes) { return $default }
  $label = if ($default) { "$prompt [$default]" } else { $prompt }
  $v = Read-Host $label
  if ([string]::IsNullOrWhiteSpace($v)) { return $default } else { return $v.Trim() }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker Desktop is not installed: https://www.docker.com/products/docker-desktop/' }
docker compose version *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose v2 is not available (docker compose).' }
docker info *> $null; if ($LASTEXITCODE -ne 0) { Fail 'Docker is not running. Start Docker Desktop and try again.' }
if (-not (Test-Path -LiteralPath $envFile)) { Fail '.env is missing next to this script.' }

$slug = Get-EnvValue 'CELL_SLUG'
$project = "site-$slug"
$name = Get-EnvValue 'CELL_NAME'; if (-not $name) { $name = $slug }
Say "Installing $name"

docker volume inspect "${project}_pgdata" *> $null
if ($LASTEXITCODE -eq 0) {
  Say 'Already installed: keeping the current settings and data.'
} else {
  Write-Host 'Leave the domain empty to run on this computer without a domain (HTTP on a port).'
  $domain = Ask "Domain (e.g. $slug.ir)" ''
  if ($domain) {
    if (Test-PortBusy 80) { Fail 'Port 80 is in use; free it (the domain needs ports 80 and 443).' }
    if (Test-PortBusy 443) { Fail 'Port 443 is in use; free it (the domain needs ports 80 and 443).' }
    Set-EnvValue 'DOMAIN' $domain; Set-EnvValue 'SITE_URL' "https://$domain"
    Set-EnvValue 'HTTP_PORT' '80'; Set-EnvValue 'HTTPS_PORT' '443'
    $smtp = Ask 'SMTP URL for e-mail (e.g. smtps://user:pass@mail.example.com:465)' ''
    if ($smtp) {
      Set-EnvValue 'NODE_ENV' 'production'
      Set-EnvValue 'EMAIL_PROVIDER' 'smtp'; Set-EnvValue 'SMTP_URL' $smtp
      Set-EnvValue 'EMAIL_FROM' (Ask 'Sender address' "$name <no-reply@$domain>")
      $key = Ask 'Kavenegar API key for SMS codes' ''
      if (-not $key) { Fail 'Production needs an SMS provider. Re-run and enter a Kavenegar key, or leave SMTP empty for test mode.' }
      Set-EnvValue 'SMS_PROVIDER' 'kavenegar'; Set-EnvValue 'KAVENEGAR_API_KEY' $key
      Set-EnvValue 'KAVENEGAR_OTP_TEMPLATE' (Ask 'Kavenegar verify template' '')
    } else {
      Write-Host 'No SMTP: test mode (e-mails and SMS codes are only written to the logs).'
      Set-EnvValue 'NODE_ENV' 'development'; Set-EnvValue 'EMAIL_PROVIDER' 'console'; Set-EnvValue 'SMS_PROVIDER' 'console'
    }
  } else {
    $hostName = Ask 'Address the site is opened with' 'localhost'
    $port = Get-FreePort (Ask 'HTTP port' (Get-FreePort 8090))
    Set-EnvValue 'DOMAIN' ':80'; Set-EnvValue 'SITE_URL' "http://${hostName}:$port"
    Set-EnvValue 'HTTP_PORT' "$port"; Set-EnvValue 'HTTPS_PORT' "$(Get-FreePort 8453)"
    Set-EnvValue 'NODE_ENV' 'development'; Set-EnvValue 'EMAIL_PROVIDER' 'console'; Set-EnvValue 'SMS_PROVIDER' 'console'
  }
}

Say 'Loading the application image'
docker load -i images/api.tar.gz
if ($LASTEXITCODE -ne 0) { Fail 'Could not load images/api.tar.gz.' }

Say 'Starting'
docker compose -p $project up -d
if ($LASTEXITCODE -ne 0) { Fail 'docker compose could not start the site.' }

Write-Host -NoNewline 'Waiting for the site to start'
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  if ((docker compose -p $project logs api 2>$null) -match 'API listening') { $ready = $true; break }
  Write-Host -NoNewline '.'; Start-Sleep -Seconds 2
}
Write-Host ''
if (-not $ready) { Fail "The site did not start. Logs: docker compose -p $project logs api" }

$siteUrl = Get-EnvValue 'SITE_URL'
$httpsNote = if ((Get-EnvValue 'DOMAIN') -eq ':80') { ' (not used without a domain)' } else { '' }
Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host " $name is running" -ForegroundColor Green
Write-Host ''
Write-Host " Site     $siteUrl"
Write-Host " Admin    $siteUrl/admin"
Write-Host " Sign in  $(Get-EnvValue 'CELL_OWNER_EMAIL') / $(Get-EnvValue 'CELL_OWNER_PASSWORD')"
Write-Host ''
Write-Host ' Ports on this computer'
Write-Host "   $(Get-EnvValue 'HTTP_PORT')/tcp   HTTP  (site, admin, API)"
Write-Host "   $(Get-EnvValue 'HTTPS_PORT')/tcp   HTTPS$httpsNote"
Write-Host '   Database and API are internal only (no host ports).'
Write-Host ''
Write-Host ' Manage (in this folder)'
Write-Host "   docker compose -p $project ps"
Write-Host "   docker compose -p $project logs -f api"
Write-Host "   docker compose -p $project down        # stop (data is kept)"
Write-Host '==================================================' -ForegroundColor Green
docker compose -p $project ps --format 'table {{.Service}}\t{{.State}}\t{{.Ports}}'
