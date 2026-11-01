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
$build = $global:petTestSteps.IndexOf('node build.mjs --release')
$register = $global:petTestSteps.IndexOf('node scripts/manage-plugin.mjs register')
$stop = $global:petTestSteps.IndexOf('node scripts/stop-desktop.mjs')
$start = $global:petTestSteps.IndexOf('node scripts/start-desktop.mjs')
if (-not ($build -ge 0 -and $register -gt $build -and $stop -gt $register -and $start -gt $stop)) { throw 'Wrong update order' }
$global:petTestSteps.Clear()
& (Join-Path $root 'scripts/install.ps1')
if ($global:petTestSteps.Contains('node scripts/stop-desktop.mjs')) { throw 'Fresh install stopped a pet unnecessarily' }
$global:petTestSteps.Clear()
$global:petTestFailBuild = $true
$failed = $false
try { & (Join-Path $root 'scripts/update.ps1') } catch { $failed = $true }
if (-not $failed -or $global:petTestSteps.Exists([Predicate[string]]{ param($s) $s -eq 'node scripts/manage-plugin.mjs register' })) { throw 'Build failure did not stop the update before plugin changes' }
Write-Host 'PASS: build/register/reload ordering, fresh installation, and build failure before registration.'
