# T01 workflow reuse research — 2026-09-18

## Applicable contracts

- `App/ai-company/packages/core/src/modules/workflows/AGENTS.md` requires resolving
  `workflowExecutor` from DI and using `startWorkflow()`; callers must not insert
  workflow rows or call engine library functions directly.
- `App/ai-company/packages/core/AGENTS.md` requires app-specific modules under
  `apps/mercato/src/modules/<module>/`, cross-module scalar IDs rather than ORM
  relations, and `yarn generate` after adding auto-discovered module files.

## Reusable definition contract

- Public imports:

  ```ts
  import {
    createWorkflowsModuleConfig,
    defineWorkflow,
  } from '@open-mercato/shared/modules/workflows'
  ```

- Put the definition in the app module's root `workflows.ts`, export named
  `workflowsConfig` and default it. The generator discovers this exact file and
  registers its definitions at bootstrap.
- Canonical app-module example:
  `App/ai-company/apps/mercato/src/modules/example/workflows.ts`.
- The minimum truthful graph is `START -> AUTOMATED -> END`, with `as const` on
  `steps` and two `auto` transitions. An `AUTOMATED` step may have no activities
  and will advance, as exercised by
  `packages/core/src/modules/workflows/lib/__tests__/execution-identity.test.ts`
  and `executor-pause-on-park.test.ts`.
- Code definitions are not copied to `workflow_definitions`. They live in the
  generated in-memory registry. A started run is nevertheless a real persisted
  `WorkflowInstance`; its `definitionId` is a stable synthetic UUID. Runtime
  resolution is implemented in
  `packages/core/src/modules/workflows/lib/find-definition.ts`.

## Deterministic agent placeholder without Enterprise

- An empty `AUTOMATED` step proves traversal but produces no output. For T01's
  required input/output evidence, reuse the built-in `EXECUTE_FUNCTION` activity
  instead of creating an executor or using Enterprise Agent Orchestrator.
- `EXECUTE_FUNCTION` resolves `workflowFunction:<functionName>` from the Awilix
  container and calls it as `(args, activityContext)`. Exact implementation:
  `packages/core/src/modules/workflows/lib/activity-executor.ts`,
  `executeFunction()`.
- Register the app-owned deterministic function in the module's auto-discovered
  `di.ts` via `container.register({ ['workflowFunction:agency_operations.deterministicNoop']:
  asValue(fn) })` (or an equivalent Awilix registration). `di.ts` registration is
  the official module extension point; see
  `apps/mercato/src/modules/example/di.ts` and `.ai/docs/module-development.md`.
- The function should return the supplied input unchanged (optionally wrapped
  with a constant processor marker). It must not call a model, provider, HTTP
  endpoint, or Enterprise bridge.
- Put the synchronous `EXECUTE_FUNCTION` activity on the `AUTOMATED -> END`
  transition, for example with `activityName: 'agentResult'`,
  `functionName: 'agency_operations.deterministicNoop'`, and
  `args: { input: '{{context.agentInput}}' }`. A single-token interpolation
  preserves object/array/number types.
- Transition activity outputs are merged into workflow context under
  `activityName`; `EXECUTE_FUNCTION` yields
  `{ executed: true, functionName, result }`. Therefore the unchanged result is
  available as `execution.context.agentResult.result`. This behavior is in
  `packages/core/src/modules/workflows/lib/transition-handler.ts` and covered by
  `activity-executor.test.ts`.
- Do not place this output-producing activity on the step itself: the workflow
  guide states synchronous AUTOMATED-step outputs remain only in
  `StepInstance.outputData`, while transition outputs are written into instance
  context.

## Start and execute through DI

- Do not import `workflow-executor.ts` into the app module. Resolve the token from
  the request/job container and give it a narrow local structural type if TypeScript
  needs one. The platform itself uses this pattern in
  `packages/core/src/modules/workflows/ai-tools/authoring-pack.ts` and the
  Enterprise worker (reference only) `process-execution-starter.ts`.
- Exact calls:

  ```ts
  const executor = container.resolve<WorkflowExecutorLike>('workflowExecutor')
  const instance = await executor.startWorkflow(em, {
    workflowId: 'agency_operations.process-material',
    initialContext: { agentRunId, caseId, agentInput },
    correlationKey: `agency_agent_run:${agentRunId}`,
    metadata: {
      entityType: 'agency_operations:agent_run',
      entityId: agentRunId,
      initiatedBy: authenticatedUserId,
    },
    tenantId,
    organizationId,
  })
  agentRun.workflowInstanceId = instance.id
  await em.flush()
  const execution = await executor.executeWorkflow(
    em,
    container,
    instance.id,
    { userId: authenticatedUserId },
  )
  ```

- `startWorkflow()` alone only creates the RUNNING instance and
  `WORKFLOW_STARTED` event; it does not traverse the graph. The separate
  `executeWorkflow()` call is mandatory. Exact signatures and behavior:
  `packages/core/src/modules/workflows/lib/workflow-executor.ts`; the official
  HTTP start path is `packages/core/src/modules/workflows/api/instances/route.ts`.
- Pass tenant and organization explicitly. Derive `initiatedBy` from server auth,
  never request input.
- `correlationKey` is indexed but not unique, so it is traceability, not an
  idempotency lock. The agency service must refuse to start a second instance
  once its own run row already has `workflowInstanceId`.

## Evidence without a second orchestration platform

- Persist the returned scalar `workflowInstanceId` on the app-owned `AgentRun`;
  do not add an ORM relation to WorkflowInstance.
- Persist app-domain evidence on `AgentRun`: the immutable input snapshot and the
  validated unchanged result taken from `ExecutionResult.context.agentResult`.
  This is agency-owned evidence, not a duplicate workflow engine.
- Treat `ExecutionResult.status` as the synchronous result. For this all-sync
  graph it must be `COMPLETED`; otherwise save a failed result and do not report
  success.
- Open Mercato already owns operational evidence: WorkflowInstance, StepInstance,
  WorkflowEvent, lifecycle events, staff API
  `GET /api/workflows/instances/[id]`, and staff detail page
  `/backend/instances/[id]`. Reuse those for staff diagnostics rather than
  building another trace/event model.
- Built-in lifecycle events contain only scoped identity/state and are persistent
  at-least-once/best-effort emissions. Payload fields are `id`, `tenantId`,
  `organizationId`, `workflowId`, `version`, `status`, and `stepId`; see
  `packages/core/src/modules/workflows/events.ts` and
  `emitInstanceLifecycleEvent()` in `workflow-executor.ts`.
- If later projection is needed, subscribe idempotently to
  `workflows.instance.completed|failed`; do not query the unscoped
  `workflowExecutor.getWorkflowInstance()` from HTTP. Its own security comment
  explicitly forbids that use.
- Client portal responses should expose the agency case/run's business status and
  evidence, not the raw staff-only workflow instance API or its context.

## Focused proof

- After adding `workflows.ts` and `di.ts`, run `yarn generate`.
- A focused integration/service test should use the real request container and
  database, create the scoped agency records, call the agency service, and assert:
  a non-empty persisted `workflowInstanceId`, `COMPLETED`, output equals input,
  and the run points to the same instance ID. Do not mock `workflowExecutor` in
  the proof test.

## Risks

- `EXECUTE_FUNCTION`'s descriptor registry only feeds the visual editor picker;
  runtime execution depends on the DI token. A code-defined workflow does not
  need the descriptor, so avoid importing the workflows module's private
  descriptor registry merely for this spike.
- A process crash between starting the instance and saving its ID can orphan a
  real instance. The own-row guard plus correlation key make reconciliation
  possible; a fully durable queued start is beyond this synchronous spike.
- The code-workflow definition is in memory while the instance is persisted.
  This is intentional Open Mercato behavior, not a mock; deployment must include
  generated registry output/runtime generation.
