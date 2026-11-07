param([switch]$Check)
& (Join-Path $PSScriptRoot '../start.ps1') -ConfigPath (Join-Path $PSScriptRoot '.env') -Check:$Check
exit $LASTEXITCODE
