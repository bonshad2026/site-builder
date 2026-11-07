param([string]$PackageDirectory = '')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if (!$PackageDirectory) { $PackageDirectory = Join-Path $repo 'exports/firefighter-20261104-0844' }
$config = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $PSScriptRoot '.env')) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2].Trim() }
}
if ($config['MATSTACK_PUBLIC_URL'] -notmatch '^https://[a-z0-9_-]+\.mattunnel\.ir$') { throw 'Configure the public HTTPS tunnel URL first.' }
$envPath = Join-Path $PackageDirectory '.env'
$content = [IO.File]::ReadAllText($envPath)
if ($content -notmatch '(?m)^CELL_SLUG=firefighter\r?$') { throw 'This script only configures the firefighter package.' }
$values = @{ DOMAIN=':80'; SITE_URL=$config['MATSTACK_PUBLIC_URL']; HTTP_PORT='127.0.0.1:8735'; HTTPS_PORT='127.0.0.1:8736'; NODE_ENV='production'; EMAIL_PROVIDER='panel'; SMS_PROVIDER='panel' }
foreach ($key in $values.Keys) {
    if ($content -match "(?m)^$key=") { $content = [regex]::Replace($content,"(?m)^$key=.*$",($key+'='+$values[$key])) }
    else { $content += "`n$key=$($values[$key])" }
}
[IO.File]::WriteAllText($envPath,$content)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Caddyfile') -Destination (Join-Path $PackageDirectory 'Caddyfile') -Force
& docker compose --project-directory $PackageDirectory -p site-firefighter -f (Join-Path $PackageDirectory 'docker-compose.yml') -f (Join-Path $PSScriptRoot 'admin.compose.yml') up -d
if ($LASTEXITCODE -ne 0) { throw 'Could not start the firefighter package.' }
