<#
.SYNOPSIS
    Windows entry point for ./setup.sh, the Kestrel development setup.
.DESCRIPTION
    Kestrel runs on macOS and Linux. On Windows, the full setup (running Kestrel and every test suite)
    happens inside WSL2: clone the repository in WSL and run ./setup.sh there. On a Windows checkout,
    this script runs setup.sh with Git Bash, which prepares everything for editing: dependencies, the
    git hooks, lint and the type check.
.EXAMPLE
    .\setup.ps1           # interactive
.EXAMPLE
    .\setup.ps1 -Yes      # accept every default
.EXAMPLE
    .\setup.ps1 -Check    # only report what is installed
#>
[CmdletBinding()]
param([switch]$Yes, [switch]$Check)
$ErrorActionPreference = 'Stop'

$forward = @()
if ($Yes) { $forward += '--yes' }
if ($Check) { $forward += '--check' }

function Find-GitBash {
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($git) {
        # ...\Git\cmd\git.exe -> ...\Git\bin\bash.exe
        $bash = Join-Path (Split-Path (Split-Path $git.Source -Parent) -Parent) 'bin\bash.exe'
        if (Test-Path $bash) { return $bash }
    }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Git\bin\bash.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    Write-Host 'WSL2 is available: for the full setup (running Kestrel and all tests), clone the repository'
    Write-Host 'inside WSL and run ./setup.sh there. Continuing with the Windows setup through Git Bash.'
    Write-Host ''
}

$bash = Find-GitBash
if (-not $bash) {
    Write-Host 'Git Bash was not found. Install Git for Windows (winget install Git.Git) and run this again,'
    Write-Host 'or use WSL2 (wsl --install) for the full setup.'
    exit 1
}

Push-Location $PSScriptRoot
& $bash ./setup.sh @forward
$code = $LASTEXITCODE
Pop-Location
exit $code
