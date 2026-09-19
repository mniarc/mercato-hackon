param(
  [Parameter(Position = 0)]
  [string]$Command = 'help',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ForwardArgs
)

$ErrorActionPreference = 'Stop'

$helpText = @'
Usage: agency.ps1 <command> [launcher arguments]

  start    Run yarn dev:agency
  status   Run yarn dev:agency:status
  demo     Run yarn test:agency:demo (headed, with screenshots)
  help     Show this help

Arguments after the command are forwarded unchanged, for example:
  agency.ps1 start --journey production
  agency.ps1 demo --journey production

The local app uses http://localhost:5002. These aliases reuse the existing
persistent agency launcher; they do not build, reset, seed, or enable paid calls.
'@

if ($Command -in @('help', '-h', '--help')) {
  [Console]::Out.WriteLine($helpText)
  exit 0
}

$scriptName = switch ($Command) {
  'start' { 'dev:agency' }
  'status' { 'dev:agency:status' }
  'demo' { 'test:agency:demo' }
  default {
    [Console]::Error.WriteLine("Unknown command: $Command")
    [Console]::Error.WriteLine($helpText)
    exit 2
  }
}

$teamRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $teamRoot 'ai-company'
$exitCode = 1
Push-Location -LiteralPath $appRoot
try {
  & yarn $scriptName @ForwardArgs
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $exitCode
