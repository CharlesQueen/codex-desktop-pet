# Author: CharlesQueen
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot '../server.mjs') --preview
