#!/bin/sh
set -eu

help_text='Usage: agency.sh <command> [launcher arguments]

  start    Run yarn dev:agency
  status   Run yarn dev:agency:status
  demo     Run yarn test:agency:demo (headed, with screenshots)
  setup | migrate | cli    Forward to the same agency launcher
  manual-fixture          Customer + staff app (5004), unpaid provider and workers
  manual-live --allow-live Persistent manual app (5006), explicit paid-model opt-in
  help     Show this help

Arguments after the command are forwarded unchanged, for example:
  agency.sh start --journey production
  agency.sh demo --journey production

Default development uses http://localhost:5002. Manual profiles have separate
persistent databases. Setup initializes only the named profile; no command resets it.
Manual startup reuses the sole local scope; if there are several, select both
AGENCY_MANUAL_TENANT_ID and AGENCY_MANUAL_ORGANIZATION_ID from status --profile fixture.'

command_name=${1:-help}
case "$command_name" in
  help|-h|--help)
    printf '%s\n' "$help_text"
    exit 0
    ;;
  start|status|setup|migrate|cli|demo|manual-fixture|manual-live)
    ;;
  *)
    printf 'Unknown command: %s\n\n%s\n' "$command_name" "$help_text" >&2
    exit 2
    ;;
esac
shift

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir/../ai-company"
case "$command_name" in
  demo) exec yarn test:agency:demo "$@" ;;
  manual-fixture) exec node scripts/agency-dev.mjs start --profile fixture "$@" ;;
  manual-live) exec node scripts/agency-dev.mjs start --profile live "$@" ;;
  *) exec node scripts/agency-dev.mjs "$command_name" "$@" ;;
esac
