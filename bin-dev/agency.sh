#!/bin/sh
set -eu

help_text='Usage: agency.sh <command> [launcher arguments]

  start    Run yarn dev:agency
  status   Run yarn dev:agency:status
  demo     Run yarn test:agency:demo (headed, with screenshots)
  help     Show this help

Arguments after the command are forwarded unchanged, for example:
  agency.sh start --journey production
  agency.sh demo --journey production

The local app uses http://localhost:5002. These aliases reuse the existing
persistent agency launcher; they do not build, reset, seed, or enable paid calls.'

command_name=${1:-help}
case "$command_name" in
  help|-h|--help)
    printf '%s\n' "$help_text"
    exit 0
    ;;
  start)
    script_name=dev:agency
    ;;
  status)
    script_name=dev:agency:status
    ;;
  demo)
    script_name=test:agency:demo
    ;;
  *)
    printf 'Unknown command: %s\n\n%s\n' "$command_name" "$help_text" >&2
    exit 2
    ;;
esac
shift

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$script_dir/../ai-company"
exec yarn "$script_name" "$@"
