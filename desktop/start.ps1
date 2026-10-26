# Author: CharlesQueen
param([string]$Session)
$ErrorActionPreference='Stop'
$PetRoot=Split-Path $PSScriptRoot -Parent
$PetExecutable=Join-Path $PetRoot 'node_modules/electron/dist/electron.exe'
$PetMain=Join-Path $PSScriptRoot 'main.mjs'
$PetArguments=@(('"'+$PetMain+'"'))
if ($Session) { $PetArguments+=@('--session',('"'+$Session+'"')) }
Start-Process -FilePath $PetExecutable -ArgumentList $PetArguments -WorkingDirectory $PetRoot -WindowStyle Hidden
