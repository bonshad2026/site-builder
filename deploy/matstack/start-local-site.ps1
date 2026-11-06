param([string]$PackageDirectory = '')
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (!$PackageDirectory) {
    $package = Get-ChildItem -LiteralPath (Join-Path $repo 'exports') -Directory -Filter 'cafe-mohammad-*' |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'docker-compose.yml') } |
        Sort-Object Name -Descending | Select-Object -First 1
    if (!$package) { throw 'Build/extract an install package for cafe-mohammad under exports first.' }
    $PackageDirectory = $package.FullName
}
$config = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env')) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2].Trim() }
}
$envPath = Join-Path $PackageDirectory '.env'
$content = [System.IO.File]::ReadAllText($envPath)
if ($content -notmatch '(?m)^CELL_SLUG=cafe-mohammad\r?$') { throw 'This script only configures the cafe-mohammad install package.' }
$values = @{ DOMAIN=':80';SITE_URL=$config['MATSTACK_PUBLIC_URL']; HTTP_PORT='127.0.0.1:8725'; HTTPS_PORT='127.0.0.1:8726'; NODE_ENV='production';EMAIL_PROVIDER='panel';SMS_PROVIDER='panel' }
foreach ($key in $values.Keys) { $content = [regex]::Replace($content,"(?m)^$key=.*$",($key+'='+$values[$key])) }
[System.IO.File]::WriteAllText($envPath,$content)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Caddyfile') -Destination (Join-Path $PackageDirectory 'Caddyfile') -Force
& docker compose --project-directory $PackageDirectory -p site-cafe-mohammad -f (Join-Path $PackageDirectory 'docker-compose.yml') -f (Join-Path $PSScriptRoot 'admin.compose.yml') up -d
if ($LASTEXITCODE -ne 0) { throw 'Could not start the local cafe package.' }
