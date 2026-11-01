# Author: CharlesQueen
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'manage-plugin.mjs') uninstall
if ($LASTEXITCODE -ne 0) { throw 'Plugin uninstall failed' }
