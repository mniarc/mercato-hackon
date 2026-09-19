# T99 - Retain build and package command logs

State: done
Outcome: Implemented by `dbf078f1b` with isolated invocation-log checks, package
integration and deployment guidance; no recovery of pre-change build output claimed.
Sources: user request for durable build diagnostics; existing Docker deployment runner.
Owns: `bin/agency.mjs`, `bin/package-release.mjs`, small shared log helper/tests;
coordinator owns the already-running build and recovery of its native history.

## Deliver

Stream future build/image verification/export/import and package diagnostics to
timestamped `.build-artifacts/.cache-logs/*.log`, preserving live console output,
stage/start/end/exit/signal metadata and failed runs. No whole-build buffering,
environment dumps or automatic logging of private runtime/init/config commands.
Keep deployment bundles self-contained and redact obvious command secrets.

## Done when

Isolated checks prove stream retention/redaction/exit behavior and the portable
bundle includes its logging helper. Documentation distinguishes future logging
from separately recovered history of a build started before this change.
