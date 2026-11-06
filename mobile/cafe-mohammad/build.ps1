param([string]$AndroidToolsRoot = 'C:\Program Files\Unity\Hub\Editor\6000.5.6f1\Editor\Data\PlaybackEngines\AndroidPlayer')
$ErrorActionPreference = 'Stop'
$java = Join-Path $AndroidToolsRoot 'OpenJDK/bin/java.exe'
$sdk = Join-Path $AndroidToolsRoot 'SDK'
$launcher = Get-ChildItem -LiteralPath (Join-Path $AndroidToolsRoot 'Tools/gradle/lib') -Filter 'gradle-launcher-*.jar' | Select-Object -First 1
if (!(Test-Path -LiteralPath $java) -or !$launcher) { throw 'Set -AndroidToolsRoot to an AndroidPlayer folder containing OpenJDK, SDK and Tools/gradle.' }
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'local.properties'), 'sdk.dir=' + $sdk.Replace('\','/') + "`n")
$previousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = Join-Path $AndroidToolsRoot 'OpenJDK'
    & $java -classpath $launcher.FullName org.gradle.launcher.GradleMain -p $PSScriptRoot :app:assembleDebug --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
    $apk = Join-Path $PSScriptRoot 'app/build/outputs/apk/debug/app-debug.apk'
    $output = Join-Path $PSScriptRoot '../../exports/cafe-mohammad-debug.apk'
    Copy-Item -LiteralPath $apk -Destination $output -Force
    Write-Host ('APK: ' + [System.IO.Path]::GetFullPath($output))
} finally { $env:JAVA_HOME = $previousJavaHome }
