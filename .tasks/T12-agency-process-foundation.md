# T12 - Prove the gated native ToV reference process

State: active
Depends on: T10, T11
Owns: `agency_operations` ToV bridge and coordinator-owned live reference proof
Sources: F22-1, F51-1, F54-1, F55-1; teammate ToV service contract

The scoped persisted research service, asynchronous native workflow, exact run/
document references and employee result view are implemented (`8dae3d3b3`,
`f036f858a`). Shared OpenRouter configuration and native runtime setup exist.
Do not rebuild the dispatcher, research pipeline or document storage.

## Remaining

- Demonstrate one explicitly enabled, approved small live corpus run from a case
  to native agent traces and saved document-version references. Ordinary tests
  remain deterministic; do not make paid calls to close a bookkeeping task.
- Confirm existing failure/status propagation without fabricated success.
  Automatic human exception/resume is T21, not an implicit completed feature here.

Use [agent runs](../.dev-docs/.processes/current/agent-runs.md). Coordinator owns
runtime/credentials and proof. Current input is normalized ToV posts JSON, not
arbitrary document understanding. No duplicate queue, lifecycle or provider client.
