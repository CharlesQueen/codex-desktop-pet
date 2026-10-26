# Author: CharlesQueen
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# Copyright (c) 2026 CharlesQueen
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
    Invoke-Step 'codex' @('plugin', 'marketplace', 'add', (Join-Path $root 'release'))
    Invoke-Step 'codex' @('plugin', 'add', 'codex-desktop-pet@codex-pet-local')
    # Show the pet now; MCP can take over the same window later.
    Invoke-Step 'node' @('scripts/start-desktop.mjs')
    Write-Host 'Installed and visible. Reload Codex to enable automatic work-state following.'
} finally {
    Pop-Location
}
