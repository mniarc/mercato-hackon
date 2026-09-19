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
  setup | migrate | cli    Forward to the same agency launcher
  manual-fixture          Customer + staff app (5004), unpaid provider and workers
  manual-live --allow-live Persistent manual app (5006), explicit paid-model opt-in
  help     Show this help

Arguments after the command are forwarded unchanged, for example:
  agency.ps1 start --journey production
  agency.ps1 demo --journey production

Default development uses http://localhost:5002. Manual profiles have separate
persistent databases. Setup initializes only the named profile; no command resets it.
Manual startup reuses the sole local scope; if there are several, select both
AGENCY_MANUAL_TENANT_ID and AGENCY_MANUAL_ORGANIZATION_ID from status --profile fixture.
'@

if ($Command -in @('help', '-h', '--help')) {
  [Console]::Out.WriteLine($helpText)
  exit 0
}

$launchArgs = switch ($Command) {
  'start' { @('start') }
  'status' { @('status') }
  'demo' { @('test', '--headed') }
  'setup' { @('setup') }
  'migrate' { @('migrate') }
  'cli' { @('cli') }
  'manual-fixture' { @('start', '--profile', 'fixture') }
  'manual-live' { @('start', '--profile', 'live') }
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
  if ($Command -eq 'demo') {
    & yarn test:agency:demo @ForwardArgs
  } else {
    & node scripts/agency-dev.mjs @launchArgs @ForwardArgs
  }
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $exitCode
