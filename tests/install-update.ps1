# Author: CharlesQueen
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
$ErrorActionPreference = 'Stop'
$global:petTestSteps = [System.Collections.Generic.List[string]]::new()
$global:petTestFailBuild = $false
function pnpm { $global:petTestSteps.Add("pnpm $($args -join ' ')"); $global:LASTEXITCODE = 0 }
function codex { $global:petTestSteps.Add("codex $($args -join ' ')"); $global:LASTEXITCODE = 0 }
function node {
    $global:petTestSteps.Add("node $($args -join ' ')")
    $global:LASTEXITCODE = if ($global:petTestFailBuild -and $args[0] -eq 'build.mjs') { 17 } else { 0 }
}
$root = Split-Path $PSScriptRoot -Parent
& (Join-Path $root 'scripts/update.ps1')
$remove = $global:petTestSteps.IndexOf('codex plugin remove codex-desktop-pet@codex-pet-local')
$build = $global:petTestSteps.IndexOf('node build.mjs --release')
$add = $global:petTestSteps.IndexOf('codex plugin add codex-desktop-pet@codex-pet-local')
if (-not ($build -ge 0 -and $remove -gt $build -and $add -gt $remove)) { throw 'Wrong update order' }
if ($global:petTestSteps[-1] -ne 'node scripts/start-desktop.mjs') { throw 'Updated pet was not launched' }
$global:petTestSteps.Clear()
& (Join-Path $root 'scripts/install.ps1')
if ($global:petTestSteps.Contains('codex plugin remove codex-desktop-pet@codex-pet-local')) { throw 'Fresh install removed a plugin' }
$global:petTestSteps.Clear()
$global:petTestFailBuild = $true
$failed = $false
try { & (Join-Path $root 'scripts/update.ps1') } catch { $failed = $true }
if (-not $failed -or $global:petTestSteps.Exists([Predicate[string]]{ param($s) $s.StartsWith('codex ') })) { throw 'Build failure did not stop the update before plugin changes' }
Write-Host 'PASS: update order, launch, fresh installation and build failure (mocked external commands).'
