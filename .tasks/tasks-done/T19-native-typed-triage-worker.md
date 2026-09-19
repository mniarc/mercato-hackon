# T19 - Run one native typed triage worker

State: done (bounded native orchestration; paid limits remain T24)
Depends on: T15, T18
Owns: `agency_operations/ai-agents.ts`, `agents/client-triage/**`, and the
native workflow triage invocation/result-persistence seam
Sources: F42-1, F45-1, F51-1, F54-1

## Deliver

- Activate native `agent_orchestrator` `defineAgent` through workflow
  `INVOKE_AGENT`, shared `OM_AI` configuration and the workflow execution
  principal. Use DI `agentRuntime.run` only where a genuine domain pipeline needs
  it. Enterprise is required for this path; keep the deterministic baseline.
- Reuse the role's typed research result and pure authorized-result projection.
  No ToV changes, agency registration/run wrapper, provider client, direct SDK
  callback, or second executor.
- Persist typed intent/mixed parts and rationale separately from authorized
  disposition. Server code derives allowed targets; replay never reclassifies.
  Only existing answer/clarify routes apply effects; other intents remain explicit
  unapplied outcomes.

## Done when

- Focused checks prove saved-result reuse, scope propagation and honest failure;
  the coordinator wires asynchronous workflow/projection/configuration/grants.
- Before paid proof, identify and enforce the actual native path's required
  technical bounds with T24: declared configuration alone is not F51 compliance.

Keep the deterministic baseline available. No paid execution without approved
configuration/bounds; no new business policy or ToV pipeline changes.

Discovery is default-off. The opt-in native workflow, configure CLI, scoped original
loading, post-commit dispatch and authorized result projection are implemented;
the canonical headed demo passed on the persistent database with local intelligence
on 2026-09-19. This is not live-provider or full F51 proof. The native run timeout is not a monetary/token cap or a
guarantee that an in-flight provider request is cancelled. Reject unsupported
required limits; resolve that gap before enabling paid execution.
