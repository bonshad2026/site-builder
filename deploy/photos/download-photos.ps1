# Downloads the template photos into var/demo-images (needs access to unsplash.com, e.g. a VPN).
# Already downloaded photos are skipped, so it is safe to run again.
#   Double-click download-photos.cmd, or: powershell -ExecutionPolicy Bypass -File download-photos.ps1
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$list = Join-Path $PSScriptRoot 'template-photos.txt'
$target = Join-Path $PSScriptRoot '..\..\var\demo-images'
New-Item -ItemType Directory -Force -Path $target | Out-Null

$ok = 0; $skipped = 0; $failed = @()
foreach ($line in Get-Content -LiteralPath $list) {
  if ($line -match '^\s*#' -or -not $line.Trim()) { continue }
  $id, $template, $url = $line -split "`t"
  $file = Join-Path $target "$id.jpg"
  if (Test-Path -LiteralPath $file) { $skipped++; continue }
  try {
    Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -TimeoutSec 60 -MaximumRedirection 5
    if ((Get-Item -LiteralPath $file).Length -lt 10000) { throw 'not an image' }
    $ok++
    Write-Host "OK      $id ($template)"
  } catch {
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    $failed += "$id ($template)"
    Write-Host "FAILED  $id ($template)" -ForegroundColor Red
  }
}
Write-Host ''
Write-Host "Downloaded: $ok   Already there: $skipped   Failed: $($failed.Count)" -ForegroundColor Green
if ($failed.Count) { Write-Host 'Failed photos can be saved by hand from the links in template-photos.txt (as <id>.jpg).' }
Write-Host 'Then, in the studio: Client sites -> "Refresh photos" on each site.'
