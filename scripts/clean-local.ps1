param(
    [switch]$All,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$targets = @(
    "desktop\out",
    "desktop\release",
    "desktop\.tmp-electron-user-data",
    "desktop\.vite",
    "desktop\.cache",
    "desktop\.electron-vite",
    "android\app\build",
    "android\.gradle",
    "android\.kotlin",
    ".pytest_cache"
)

$tmpGradleDirs = Get-ChildItem -LiteralPath $root -Force -Directory -Filter ".tmp-gradle-wrapper-gen-*" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName }
$pythonCacheDirs = Get-ChildItem -LiteralPath (Join-Path $root "backend") -Force -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { $_.FullName }

if ($All) {
    $targets += "desktop\node_modules"
}

function Resolve-SafeTarget {
    param([string]$Target)

    $fullPath = if ([System.IO.Path]::IsPathRooted($Target)) {
        [System.IO.Path]::GetFullPath($Target)
    } else {
        [System.IO.Path]::GetFullPath((Join-Path $root $Target))
    }

    $rootWithSeparator = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if ($fullPath -eq $root -or -not $fullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove outside workspace: $fullPath"
    }

    return $fullPath
}

foreach ($target in ($targets + $tmpGradleDirs + $pythonCacheDirs)) {
    $fullPath = Resolve-SafeTarget $target
    if (Test-Path -LiteralPath $fullPath) {
        if ($DryRun) {
            Write-Host "[clean] would remove $fullPath"
            continue
        }
        Remove-Item -LiteralPath $fullPath -Recurse -Force
        Write-Host "[clean] removed $fullPath"
    }
}
