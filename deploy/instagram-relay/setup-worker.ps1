$ErrorActionPreference = 'Stop'
$workerEnv = Join-Path $PSScriptRoot '.worker.env'
if (Test-Path -LiteralPath $workerEnv) { Write-Output 'Worker configuration already exists.'; exit 0 }
$tenantDb = (& docker exec site-cafe-mohammad-db-1 psql -U sb_admin -d sb_control -Atc "SELECT db_name FROM tenants WHERE slug='cafe-mohammad'").Trim()
if ($LASTEXITCODE -ne 0 -or $tenantDb -notmatch '^[a-zA-Z0-9_]+$') { throw 'Cannot resolve tenant database.' }
$workerPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$workerSql = "CREATE ROLE sb_instagram LOGIN PASSWORD '$workerPassword'; GRANT CONNECT ON DATABASE $tenantDb TO sb_instagram; GRANT USAGE ON SCHEMA public TO sb_instagram; GRANT SELECT, UPDATE ON instagram_outbox, instagram_connection TO sb_instagram;"
$workerSql | & docker exec -i site-cafe-mohammad-db-1 psql -U sb_admin -d $tenantDb -v ON_ERROR_STOP=1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot create relay database role.' }
$apiInfo = (& docker inspect site-cafe-mohammad-api-1 | ConvertFrom-Json)[0]
$secretsEntry = $apiInfo.Config.Env | Where-Object { $_.StartsWith('TENANT_SECRETS_KEY=') }
if (-not $secretsEntry) { throw 'Missing API encryption key.' }
$relayKey = $secretsEntry.Substring('TENANT_SECRETS_KEY='.Length)
[IO.File]::WriteAllText($workerEnv,"RELAY_DATABASE_URL=postgresql://sb_instagram:" + $workerPassword + "@site-cafe-mohammad-db-1:5432/" + $tenantDb + [Environment]::NewLine + "RELAY_SECRETS_KEY=" + $relayKey)
Write-Output 'Created restricted worker configuration.'
