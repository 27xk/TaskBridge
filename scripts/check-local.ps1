param(
    [switch]$ReportOnly,
    [switch]$Strict,
    [switch]$BootstrapMissing,
    [switch]$SkipBackend,
    [switch]$SkipDesktopBuild,
    [switch]$IncludeAndroid,
    [switch]$IncludeAndroidAssemble
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:results = @()

function Add-Result {
    param(
        [string]$Name,
        [ValidateSet("passed", "failed", "blocked", "skipped")]
        [string]$Status,
        [string]$Detail = ""
    )

    $script:results += [PSCustomObject]@{
        Name = $Name
        Status = $Status
        Detail = $Detail
    }
}

function Join-Root {
    param([string]$RelativePath)
    return [System.IO.Path]::GetFullPath((Join-Path $root $RelativePath))
}

function Test-RelativePath {
    param([string]$RelativePath)
    return Test-Path -LiteralPath (Join-Root $RelativePath)
}

function Get-MissingRelativePaths {
    param([string[]]$RelativePaths)

    $missing = @()
    foreach ($relativePath in $RelativePaths) {
        if (-not (Test-RelativePath $relativePath)) {
            $missing += $relativePath
        }
    }
    return $missing
}

function Test-ExternalCommand {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Step {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string[]]$Arguments = @()
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan

    if (-not (Test-Path -LiteralPath $WorkingDirectory)) {
        Add-Result $Name "blocked" "Working directory is missing: $WorkingDirectory"
        Write-Host "[blocked] $Name"
        return
    }

    Push-Location -LiteralPath $WorkingDirectory
    try {
        $global:LASTEXITCODE = $null
        & $Command @Arguments
        $exitCode = $global:LASTEXITCODE
        if ($null -eq $exitCode) {
            if ($?) {
                $exitCode = 0
            } else {
                $exitCode = 1
            }
        }

        if ($exitCode -eq 0) {
            Add-Result $Name "passed"
            Write-Host "[passed] $Name" -ForegroundColor Green
        } else {
            Add-Result $Name "failed" "Exit code $exitCode"
            Write-Host "[failed] $Name (exit $exitCode)" -ForegroundColor Red
        }
    } catch {
        Add-Result $Name "failed" $_.Exception.Message
        Write-Host "[failed] $Name - $($_.Exception.Message)" -ForegroundColor Red
    } finally {
        Pop-Location
    }
}

function Add-Blocked {
    param(
        [string]$Name,
        [string]$Detail
    )

    Add-Result $Name "blocked" $Detail
    Write-Host "[blocked] $Name - $Detail" -ForegroundColor Yellow
}

function Add-Skipped {
    param(
        [string]$Name,
        [string]$Detail
    )

    Add-Result $Name "skipped" $Detail
    Write-Host "[skipped] $Name - $Detail" -ForegroundColor DarkYellow
}

function Test-PythonModule {
    param([string]$ModuleName)

    if (-not (Test-ExternalCommand "python")) {
        return $false
    }

    Push-Location -LiteralPath (Join-Root "backend")
    try {
        $global:LASTEXITCODE = $null
        try {
            & python -c "import $ModuleName" *> $null
            return $global:LASTEXITCODE -eq 0
        } catch {
            return $false
        }
    } finally {
        Pop-Location
    }
}

function Test-GradleDistributionAvailable {
    $propertiesPath = Join-Root "android\gradle\wrapper\gradle-wrapper.properties"
    if (-not (Test-Path -LiteralPath $propertiesPath)) {
        return $false
    }

    $distributionLine = Get-Content -LiteralPath $propertiesPath -Encoding UTF8 |
        Where-Object { $_ -like "distributionUrl=*" } |
        Select-Object -First 1
    if (-not $distributionLine) {
        return $false
    }

    $distributionUrl = $distributionLine -replace "^distributionUrl=", ""
    $distributionUrl = $distributionUrl -replace "\\:", ":"
    $distributionName = [System.IO.Path]::GetFileName($distributionUrl)
    $distributionBaseName = $distributionName -replace "\.zip$", ""
    $gradleHome = $env:GRADLE_USER_HOME
    if (-not $gradleHome) {
        $gradleHome = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".gradle"
    }

    $wrapperDists = Join-Path $gradleHome "wrapper\dists"
    if (-not (Test-Path -LiteralPath $wrapperDists)) {
        return $false
    }

    $matches = Get-ChildItem -LiteralPath $wrapperDists -Force -Directory -Filter $distributionBaseName -ErrorAction SilentlyContinue
    foreach ($match in $matches) {
        $okFile = Get-ChildItem -LiteralPath $match.FullName -Force -Recurse -Filter "$distributionName.ok" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($okFile) {
            return $true
        }
    }

    return $false
}

Write-Host "TaskBridge local verification"
Write-Host "Workspace: $root"
if ($ReportOnly) {
    Write-Host "Report-only mode: blocked checks are listed but do not fail the run"
} else {
    Write-Host "Strict mode: blocked checks fail the run"
}
Write-Host "Bootstrap missing dependencies with: .\scripts\bootstrap-local.ps1"

if ($BootstrapMissing) {
    $bootstrapArgs = @()
    if ($SkipBackend) {
        $bootstrapArgs += "-SkipBackend"
    }
    if ($IncludeAndroid) {
        $bootstrapArgs += "-IncludeAndroid"
    }
    Write-Host ""
    Write-Host "==> bootstrap missing dependencies" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "bootstrap-local.ps1") @bootstrapArgs
    if ($LASTEXITCODE -ne 0) {
        throw "bootstrap-local.ps1 failed with exit code $LASTEXITCODE"
    }
}

if ($SkipBackend) {
    Add-Skipped "backend checks" "Skipped by -SkipBackend"
} elseif (-not (Test-ExternalCommand "python")) {
    Add-Blocked "backend checks" "python is not available on PATH"
} else {
    Invoke-Step "backend pytest" (Join-Root "backend") "python" @("-m", "pytest", "tests", "-q")
    Invoke-Step "backend alembic migrations" (Join-Root "backend") "python" @("-m", "pytest", "tests\test_migrations.py", "-q")
    Invoke-Step "backend compileall" (Join-Root "backend") "python" @("-m", "compileall", "-q", "app", "tests", "tools")
    Invoke-Step "backend openapi contract" (Join-Root "backend") "python" @("-m", "tools.openapi_contract", "--check")

    if (Test-PythonModule "ruff") {
        Invoke-Step "backend ruff" (Join-Root "backend") "python" @("-m", "ruff", "check", "app", "tests", "tools")
    } else {
        Add-Blocked "backend ruff" "Run .\scripts\bootstrap-local.ps1, or install backend dev dependencies: python -m pip install -r backend\requirements-dev.txt"
    }
}

if (Test-ExternalCommand "node") {
    Invoke-Step "version source check" $root "node" @("scripts\check-version-source.mjs")
    Invoke-Step "web client static check" $root "node" @("scripts\check-web-client.mjs")
    Invoke-Step "web unit tests" $root "node" @("--test", "web/tests/**/*.test.mjs")
    Invoke-Step "web client offline-first check" $root "node" @("scripts\check-web-offline-first.mjs")
    Invoke-Step "web offline core behavior check" $root "node" @("scripts\check-web-offline-core.mjs")
    Invoke-Step "web client HTTP smoke" $root "node" @("scripts\smoke-web-client.mjs")
} else {
    Add-Blocked "version source check" "node is not available on PATH"
    Add-Blocked "web client static check" "node is not available on PATH"
    Add-Blocked "web unit tests" "node is not available on PATH"
    Add-Blocked "web client offline-first check" "node is not available on PATH"
    Add-Blocked "web offline core behavior check" "node is not available on PATH"
    Add-Blocked "web client HTTP smoke" "node is not available on PATH"
}

if (-not (Test-ExternalCommand "npm")) {
    Add-Blocked "desktop checks" "npm is not available on PATH"
} else {
    $desktopChecks = @(
        "check:lockfile-registry",
        "check:desktop-endpoint-config",
        "check:security-config",
        "check:auth-session-config",
        "check:backend-observability",
        "check:package-size-config",
        "check:sync-push",
        "check:sync-diagnostics",
        "check:sync-recovery-center",
        "check:desktop-backup",
        "check:desktop-theme",
        "check:desktop-efficiency",
        "check:desktop-docs",
        "check:local-bootstrap",
        "check:release-readiness",
        "check:release-artifacts",
        "check:production-hardening",
        "check:desktop-task-list-completeness",
        "check:android-localization",
        "check:android-task-delete-confirmation",
        "check:refresh-singleflight",
        "check:registration-governance",
        "check:sync-retry-preservation",
        "check:android-list-realtime",
        "check:release-endpoint-defaults",
        "check:android-sync-status-message",
        "check:android-sync-recovery",
        "check:ci-workflows",
        "check:contract-drift",
        "check:source-tests-visible",
        "check:supply-chain",
        "check:desktop-auto-update",
        "check:android-data-extraction",
        "check:security-governance",
        "check:ux-priority-polish",
        "check:user-experience"
    )

    foreach ($check in $desktopChecks) {
        Invoke-Step "desktop $check" (Join-Root "desktop") "npm" @("run", $check)
    }

    $typeScriptMissing = Get-MissingRelativePaths @("desktop\node_modules\typescript")
    if ($typeScriptMissing.Count -eq 0) {
        Invoke-Step "desktop test:unit" (Join-Root "desktop") "npm" @("run", "test:unit")
        Invoke-Step "desktop check:quick-add-parser" (Join-Root "desktop") "npm" @("run", "check:quick-add-parser")
        Invoke-Step "desktop check:task-order" (Join-Root "desktop") "npm" @("run", "check:task-order")
    } else {
        $detail = "Missing TypeScript dependency: $($typeScriptMissing -join ', '); run .\scripts\bootstrap-local.ps1, or run npm ci in desktop\ first."
        Add-Blocked "desktop test:unit" $detail
        Add-Blocked "desktop check:quick-add-parser" $detail
        Add-Blocked "desktop check:task-order" $detail
    }

    $typecheckMissing = Get-MissingRelativePaths @(
        "desktop\node_modules\.bin\vue-tsc.cmd",
        "desktop\node_modules\typescript",
        "desktop\node_modules\vue"
    )
    if ($typecheckMissing.Count -eq 0) {
        Invoke-Step "desktop typecheck" (Join-Root "desktop") "npm" @("run", "typecheck")
    } else {
        Add-Blocked "desktop typecheck" "Missing desktop dependencies: $($typecheckMissing -join ', '); run .\scripts\bootstrap-local.ps1, or run npm ci in desktop\ first."
    }

    if ($SkipDesktopBuild) {
        Add-Skipped "desktop build" "Skipped by -SkipDesktopBuild"
    } else {
        $buildMissing = Get-MissingRelativePaths @(
            "desktop\node_modules\.bin\vue-tsc.cmd",
            "desktop\node_modules\electron-vite",
            "desktop\node_modules\vite",
            "desktop\node_modules\@vitejs\plugin-vue",
            "desktop\node_modules\vue"
        )
        if ($buildMissing.Count -eq 0) {
            Invoke-Step "desktop build" (Join-Root "desktop") "npm" @("run", "build")
        } else {
            Add-Blocked "desktop build" "Missing desktop build dependencies: $($buildMissing -join ', '); run .\scripts\bootstrap-local.ps1, or run npm ci in desktop\ first."
        }
    }
}

if ($IncludeAndroid) {
    if (-not (Test-Path -LiteralPath (Join-Root "android\gradlew.bat"))) {
        Add-Blocked "android unit tests" "android\gradlew.bat is missing"
    } elseif (-not (Test-GradleDistributionAvailable)) {
        Add-Blocked "android unit tests" "Gradle wrapper distribution is not cached; run .\scripts\bootstrap-local.ps1 -IncludeAndroid online once, or provide the wrapper distribution."
    } else {
        Invoke-Step "android unit tests" (Join-Root "android") ".\gradlew.bat" @("testDebugUnitTest", "-PTASKBRIDGE_USE_CHINA_MIRRORS=false", "--offline", "--stacktrace")
        if ($IncludeAndroidAssemble) {
            Invoke-Step "android assemble debug" (Join-Root "android") ".\gradlew.bat" @(":app:assembleDebug", "-PTASKBRIDGE_USE_CHINA_MIRRORS=false", "--offline", "--stacktrace")
        }
    }
} else {
    Add-Skipped "android checks" "Pass -IncludeAndroid to run offline Gradle checks."
}

$failed = @($script:results | Where-Object { $_.Status -eq "failed" })
$blocked = @($script:results | Where-Object { $_.Status -eq "blocked" })
$skipped = @($script:results | Where-Object { $_.Status -eq "skipped" })
$passed = @($script:results | Where-Object { $_.Status -eq "passed" })

Write-Host ""
Write-Host "Summary"
Write-Host "  passed : $($passed.Count)"
Write-Host "  failed : $($failed.Count)"
Write-Host "  blocked: $($blocked.Count)"
Write-Host "  skipped: $($skipped.Count)"

$attention = @($failed + $blocked + $skipped)
if ($attention.Count -gt 0) {
    Write-Host ""
    $attention | Format-Table -AutoSize Name, Status, Detail
}

if ($failed.Count -gt 0 -or ($blocked.Count -gt 0 -and -not $ReportOnly)) {
    exit 1
}
