# T24 - Pin approved configuration to agency execution

State: deferred beyond demo (global limits accepted; per-case versioning is not a demo prerequisite)
Depends on: T23; coordinate T19 activation
Owns: role-specific configuration beside the worker and its native workflow binding;
introduce shared product configuration only when an actual process needs it
Sources: F60-1, F51-1; F04-2, F05-2, F06-1, F20-1, F26-1, F30-1, F43-1, F44-1, F50-1

## Deliver

- Search native configuration/versioned storage first. Supply agency-approved
  offer, process, execution limits and required WZR references without a new admin UI.
- Pin offer to order and applicable process/limits/templates to execution;
  subsequent edits cannot silently replace them. Reject missing/inconsistent
  required references at the execution boundary with a concrete reason.
- Reuse shared native model/provider configuration; separate prompts from product
  standards. Define only the limits the selected native execution path can enforce.

## Done when

- One configured worker consumes pinned versions; a later configuration edit does
  not alter that run, and missing required config prevents execution. Focused tests
  cover this seam and actual task-bound enforcement, reusing T19 checks.

## Constraints

- Prices, topic counts, budgets, template contents and allowed routes require an
  agency decision; do not invent defaults or claim unsupported monetary caps work.

## Demo decision and later STD-LIMITY seam

Research, strategy, planning and post execution still read the teammate's
`agency_research/data/templates.ts` limits. Phase cost authorization is pinned in
the native analysis workflow policy, but neither that policy nor the saved order
contains an approved STD-LIMITY version. The user accepts the existing global
limits for the demo: do not add per-case configuration, version lookup or an
approval workflow, and do not block demo delivery on this task. Keep current
retry/timeout/spend safeguards and the existing fixture/live selection.

Per-case version/snapshot pinning remains an unmet production requirement, not
claimed implemented. Revisit only when production scope needs it, reusing native
configuration rather than a second settings store. This demo decision does not
authorize paid calls, real charges or publication.

## First bounded seam: T19

`agents/client-triage/configuration.ts` exposes the default-off
`OM_AGENCY_TRIAGE_ENABLED` gate. The coordinator must also require the native
Enterprise bridge and workflow execution identity. This is activation, not
approval of a budget or completion of F51/F60. Paid proof needs explicit
agency-approved model, timeout/retry settings and spending authorization.
The local intelligence fixture may prove orchestration separately.
The role-local check now resolves explicit disabled/fixture/live readiness at
registration and preparation. Live requires the shared provider/model/key and
supported timeout/retry controls; it is not activated during unpaid integration.

Reuse shared `OM_AI_PROVIDER` / `OM_AI_MODEL`. Native in-process runs read
`OM_AGENT_RUN_TIMEOUT_MS`; timeout records failure but does not cancel an in-flight
provider request. `OM_AGENT_PROVIDER_RETRY_MAX` and
`OM_AGENT_PROVIDER_RETRY_BASE_MS` govern throttling retries, not all provider
attempts; zero falls back to the native default. The agent queue may retry
capacity failures separately. INVOKE_AGENT config accepts no monetary/token cap
or per-run bound override, and its parked execution does not consume an activity's
timeout/retry settings as agent bounds. Do not expose unsupported controls.

The native structured-object path also does not wire `BudgetEnforcer` or expose
SDK output-token/retry bounds through `DefineAgentInput`/`INVOKE_AGENT`. Native
`loop.maxSteps` is not a cost cap; employee recovery starts another run/deadline,
not a bounded task-wide attempt counter. Full F51 still needs pinned task limits
and accounting across recovery; do not add a second executor. F51 does not demand
provider cancellation, a hard in-flight monetary ceiling, zero overshoot or an
output-token cap. Do not invent these as prerequisites for a controlled live demo.
Explicit disabled/fixture/live readiness is implemented without contacting a
provider. Paid-run approval, effective model verification and honest cost estimation
remain separate; readiness is not full F51/F60 completion.

Native `WorkflowInstance.definitionId/version` identifies a definition row, not
an immutable copy: config edits and `upsertOwnedDefinition` can mutate that row.
Use native publish/new versions for changes and do not upsert over active owned
definitions. Global runtime env, current agent prompts and model resolution are
not per-run pinned by the workflow version; full configuration pinning remains
future work, with no new store required merely for this opt-in slice.
