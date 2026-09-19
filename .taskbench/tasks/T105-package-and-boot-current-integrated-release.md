# T105 - Package and boot the current integrated release

State: deferred (user prioritizes indev testing; no build/artifact work now)
Priority: P0-immediate
Depends on: integrated source checkpoint; runtime lease for boot
Owns: `bin/**`, `.demo-docs/server-setup/**`, existing build handoff; no application feature edits.
Sources: user-requested deployable current app; existing native Docker/Compose build and package commands.

## Deliver

- Prepare the current build/package path and fix demonstrated packaging defects without rebuilding after each feature change.
- At the coordinator's source freeze, build the exact revision once, verify/export/package it with durable `.build-artifacts/.cache-logs` output.
- Import/init/boot on an explicitly isolated server target; existing fixed `agency-server` project is not isolated by another folder or port. Preserve all existing development data and private secrets.
- Prove service readiness, configured staff login and persisted state across restart; label source revision and package path.

## Done when

A current integrated artifact exists and its documented installation works.
The earlier `1209dbd26` package is a valid baseline, not proof of current ToV/UI.
No model spend, real payments, publication or automatic reset. Shared Docker,
database and browser operations require the single runtime owner's coordination.
