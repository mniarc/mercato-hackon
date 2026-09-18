# T11 - Connect agency work to native agent orchestration

State: ready
Depends on: TOV-01
Owns: agency-to-orchestrator integration seam; no portal or shared-runtime changes
Context: Prepare the next slice so agency work can dispatch real agent processes through Open Mercato and reuse the teammate ToV path.

## Deliver
- Identify supported orchestrator execution/delegation contracts and what ToV already implements.
- Define the smallest agency-owned dispatcher/bridge, persisted run/artifact references, and required setup.
- Separate immediately implementable integration from missing team contracts or runtime prerequisites.
- Configure OpenRouter through the platform's existing provider/model/key settings; provide a secret-free team setup example and clear missing-configuration behavior before real runs.

## Done when
- The next implementation step has concrete platform call sites, ownership boundaries, and a bounded verification path.

## Constraints
- Reuse native orchestration/delegation; do not create another agent framework or copy ToV logic.
- No live LLM calls, real-key storage/commits, migrations, shared server operations, or changes to the current no-op demo.
- Keep findings in this task handoff; no research-report/ADR proliferation.

## Ready next step

Do not build another dispatcher. Open Mercato already owns native execution and
delegation; ToV already injects that runtime into its bounded map/reduce pipeline.
Configuration uses the existing env contract; see
[agent runs](../.dev-docs/.processes/current/agent-runs.md). No live calls or
enterprise activation were performed for this preparation.

Implement one case-to-ToV bridge after activation: take explicit tenant/org/user
scope plus a small stored corpus; invoke the teammate pipeline through
`container.resolve('agentRuntime').run(...)`; persist the case's ToV research-run
and document-version references. Keep ToV storage/orchestration in its module:
its persisted CLI wrapper currently owns that composition, so expose a narrow
teammate service rather than copying CLI internals into agency operations.
Use the existing workflow for durable execution; no second lifecycle/queue.

Native reuse points (under `ai-company/`):

- `apps/mercato/src/modules/agency_tov/lib/tov/pipeline.ts`: exported
  `runTovPipeline` / `TovAgentRunner`; batching, concurrency, grounding and cache.
- `apps/mercato/src/modules/agency_tov/cli.ts`: `orchestratorRunner`, persisted
  input/run/output composition; `lib/store.ts` owns corpus/document persistence.
- `packages/enterprise/src/modules/agent_orchestrator/lib/runtime/agentRuntime.ts`:
  DI runtime; `persistence.ts` has `onRunPersisted` and workflow invocation IDs.
- Same module's `lib/sdk/defineAgent.ts` and `ai-tools.ts`: `subAgents` and
  `agent_orchestrator.delegate_agent` (research-only, one level, scoped, traced).
- Same module's `commands/processes.ts` and
  `lib/runtime/invokeAgentForWorkflow.ts`: durable business start/workflow bridge.
- `packages/ai-assistant/src/modules/ai_assistant/lib/model-factory.ts`: native
  provider/model resolution and fail-clear missing-key behavior, already present.

Verification for implementation: one focused bridge test for scope/run-reference
propagation and failure (no fabricated success), then one approved bounded live
corpus run on the retained database. Confirm case links, native run traces, and
ToV document version. No parallel provider framework, no broad test gate, and no
paid calls in ordinary tests. Actual LLM-directed delegation is a later explicit
agency decision use case, not a replacement for ToV's existing map/reduce.
