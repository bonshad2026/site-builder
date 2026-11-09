param([string]$AndroidToolsRoot = 'C:\Program Files\Unity\Hub\Editor\6000.5.6f1\Editor\Data\PlaybackEngines\AndroidPlayer', [switch]$Release, [string]$SigningConfig = '')
$ErrorActionPreference = 'Stop'
$java = Join-Path $AndroidToolsRoot 'OpenJDK/bin/java.exe'
$sdk = Join-Path $AndroidToolsRoot 'SDK'
$launcher = Get-ChildItem -LiteralPath (Join-Path $AndroidToolsRoot 'Tools/gradle/lib') -Filter 'gradle-launcher-*.jar' | Select-Object -First 1
if (!(Test-Path -LiteralPath $java) -or !$launcher) { throw 'Set -AndroidToolsRoot to an AndroidPlayer folder containing OpenJDK, SDK and Tools/gradle.' }
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'local.properties'), 'sdk.dir=' + $sdk.Replace('\','/') + "`n")
$names = @('JAVA_HOME','CAFE_SIGNING_STORE','CAFE_SIGNING_STORE_PASSWORD','CAFE_SIGNING_ALIAS','CAFE_SIGNING_KEY_PASSWORD')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:JAVA_HOME = Join-Path $AndroidToolsRoot 'OpenJDK'
    $variant = 'debug'
    if ($Release) {
        if (!$SigningConfig) { $SigningConfig = Join-Path $PSScriptRoot '../../var/android-signing/cafe-mohammad/signing.json' }
        $config = Get-Content -LiteralPath $SigningConfig -Raw | ConvertFrom-Json
        if (!(Test-Path -LiteralPath $config.storeFile)) { throw 'Release keystore is missing.' }
        $env:CAFE_SIGNING_STORE = $config.storeFile
        $env:CAFE_SIGNING_STORE_PASSWORD = $config.storePassword
        $env:CAFE_SIGNING_ALIAS = $config.keyAlias
        $env:CAFE_SIGNING_KEY_PASSWORD = $config.keyPassword
        $variant = 'release'
    }
    $task = if ($Release) { ':app:assembleRelease' } else { ':app:assembleDebug' }
    & $java -classpath $launcher.FullName org.gradle.launcher.GradleMain -p $PSScriptRoot $task --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    $apk = Join-Path $PSScriptRoot "app/build/outputs/apk/$variant/app-$variant.apk"
    $output = Join-Path $PSScriptRoot "../../exports/cafe-mohammad-admin-$variant.apk"
    Copy-Item -LiteralPath $apk -Destination $output -Force
    Write-Host ('APK: ' + [System.IO.Path]::GetFullPath($output))
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
