param(
    [switch]$SkipBackend,
    [switch]$SkipDesktop,
    [switch]$IncludeAndroid,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Invoke-BootstrapStep {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string[]]$Arguments = @()
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    Push-Location -LiteralPath $WorkingDirectory
    try {
        if ($CheckOnly) {
            Write-Host "[check-only] $Command $($Arguments -join ' ')"
            return
        }
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

Write-Host "TaskBridge local bootstrap"
Write-Host "Workspace: $root"

if (-not $SkipBackend) {
    # Equivalent command: python -m pip install -r backend\requirements-dev.txt
    Invoke-BootstrapStep "backend dev dependencies" $root "python" @(
        "-m",
        "pip",
        "install",
        "-r",
        "backend\requirements-dev.txt"
    )
}

if (-not $SkipDesktop) {
    # Equivalent command: npm ci
    Invoke-BootstrapStep "desktop dependencies" (Join-Path $root "desktop") "npm" @("ci")
}

if ($IncludeAndroid) {
    # Equivalent command: gradlew.bat --version
    Invoke-BootstrapStep "android Gradle wrapper cache" (Join-Path $root "android") ".\gradlew.bat" @(
        "--version"
    )

    # Equivalent command: gradlew.bat :app:dependencies --configuration debugUnitTestRuntimeClasspath
    Invoke-BootstrapStep "android unit test dependency cache" (Join-Path $root "android") ".\gradlew.bat" @(
        ":app:dependencies",
        "--configuration",
        "debugUnitTestRuntimeClasspath",
        "-PTASKBRIDGE_USE_CHINA_MIRRORS=false"
    )

    # Equivalent command: gradlew.bat :app:dependencies --configuration debugRuntimeClasspath
    Invoke-BootstrapStep "android debug runtime dependency cache" (Join-Path $root "android") ".\gradlew.bat" @(
        ":app:dependencies",
        "--configuration",
        "debugRuntimeClasspath",
        "-PTASKBRIDGE_USE_CHINA_MIRRORS=false"
    )

    # Equivalent command: gradlew.bat testDebugUnitTest :app:assembleDebug
    Invoke-BootstrapStep "android verification artifact cache" (Join-Path $root "android") ".\gradlew.bat" @(
        "testDebugUnitTest",
        ":app:assembleDebug",
        "-PTASKBRIDGE_USE_CHINA_MIRRORS=false",
        "--stacktrace"
    )
}

Write-Host ""
Write-Host "Bootstrap finished. Run .\scripts\check-local.ps1 to verify the workspace."
