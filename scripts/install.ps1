# Author: CharlesQueen
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 CharlesQueen
param([switch]$Update)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
function Invoke-Step([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
Push-Location $root
try {
    foreach ($command in @('node', 'pnpm', 'codex')) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            throw "Missing $command. Install Node.js 22.12+, pnpm 11 and Codex CLI first."
        }
    }
    Invoke-Step 'pnpm' @('install', '--frozen-lockfile')
    Invoke-Step 'node' @('node_modules/electron/install.js')
    Invoke-Step 'node' @('scripts/configure.mjs')
    Invoke-Step 'node' @('build.mjs', '--release')
    Invoke-Step 'node' @('scripts/manage-plugin.mjs', 'register')
    if ($Update) { Invoke-Step 'node' @('scripts/stop-desktop.mjs') }
    Invoke-Step 'node' @('scripts/start-desktop.mjs')
    Write-Host 'Installed; native window verified. Reload Codex to verify its plugin-management page.'
} finally {
    Pop-Location
}
