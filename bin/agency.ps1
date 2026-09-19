$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'agency.mjs') @args
exit $LASTEXITCODE
