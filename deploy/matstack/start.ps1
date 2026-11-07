param([switch]$Check, [string]$ConfigPath = '')
$ErrorActionPreference = 'Stop'
if (!$ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot '.env' }
if (!(Test-Path -LiteralPath $configPath)) { throw 'Create deploy/matstack/.env from .env.example first.' }
$config = @{}
foreach ($line in Get-Content -LiteralPath $configPath) {
    if ($line -match '^\s*([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2].Trim() }
}
$agent = $config['MATSTACK_AGENT_PATH']
if (!$agent) { $agent = Join-Path $PSScriptRoot 'bin/matstack-local-agent-windows-amd64.exe' }
if (!(Test-Path -LiteralPath $agent)) { throw 'Matstack Windows agent is missing from deploy/matstack/bin.' }
if (!$config['MATSTACK_TUNNEL_KEY']) { throw 'MATSTACK_TUNNEL_KEY is missing from the local .env file.' }
$localUrl = [uri]$config['MATSTACK_LOCAL_URL']
if ($localUrl.Host -ne '127.0.0.1') { throw 'The cafe origin must use the configured loopback address.' }
$client = New-Object System.Net.Sockets.TcpClient
try {
    $connection = $client.ConnectAsync($localUrl.Host, $localUrl.Port)
    if (!$connection.Wait(2000) -or !$client.Connected) { throw 'Local cafe port is not listening. Start the isolated site on port 8725 first.' }
} finally { $client.Dispose() }
Write-Host ('Local origin: ' + $config['MATSTACK_LOCAL_URL'])
Write-Host ('Public address: ' + $config['MATSTACK_PUBLIC_URL'])
if ($Check) { Write-Host 'Configuration and local TCP port checked; tunnel not started.'; exit 0 }
& $agent --tunnel-key $config['MATSTACK_TUNNEL_KEY']
exit $LASTEXITCODE
