# T19 - Run one native typed triage worker

State: active
Depends on: T15, T18
Owns: new `agency_operations/ai-agents.ts`, `lib/clientTriageAgent.ts`,
`lib/contracts/clientTriage.ts` and focused tests
Sources: F42-1, F45-1, F51-1, F54-1

## Deliver

- Reuse native OSS `defineAiAgent` / `runAiAgentObject`, shared `OM_AI` model
  configuration and the native workflow execution principal. No tools,
  delegation, new entity, provider client or second executor.
- Persist typed intent/mixed parts and rationale separately from authorized
  disposition. Server code derives allowed targets; replay never reclassifies.
  Only existing answer/clarify routes apply effects; other intents remain explicit
  unapplied outcomes.

## Done when

- Focused checks prove saved-result reuse, scope propagation and honest failure;
  the coordinator wires asynchronous workflow/projection/configuration/grants.
- Before paid proof, identify and enforce the required technical bounds. Native
  object execution currently does not enforce all declared budget/time/retry
  limits: opt-in and agent budget configuration alone are not F51 compliance.

Keep the deterministic baseline available. No paid execution without approved
configuration/bounds; no new business policy or ToV pipeline changes.

The uncommitted native adapter/typed definition passes focused checks and app
typecheck. Its native callback accepts explicit versioned deadline/output/retry
limits; monetary/total-token caps are unsupported. Discovery remains disabled.
Remaining: scoped workflow-owned identity, explicit activation/configuration,
asynchronous dispatch after commit, saved result/routing integration and proof.
