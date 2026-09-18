# T01 architecture audit — 2026-09-18

## Verdict

The proposed baseline is architecturally compliant with F54-1 and the no-mock
constraint **if it is described as an agency-owned code executor running inside
core Open Mercato workflows**, not as a native Open Mercato agent or Enterprise
`AgentRun`. The current implementation has real durable workflow output, but its
exact storage location and current test coverage must be stated accurately.

## Evidence and findings

1. **Enterprise may remain absent.** F54-1 acceptance criterion 4 explicitly
   keeps Enterprise Agent Orchestrator optional, and criterion 5 forbids
   presenting agency functionality as native Open Mercato functionality:
   `App/.specs/user-stories/open-mercato-warstwa-operacyjna/F54-1.md`. Enterprise's
   own contract says its `AgentRun`/proposal machinery belongs to propose-only AI
   agents, while core `WorkflowInstance` remains the one lifecycle owner:
   `App/ai-company/packages/enterprise/src/modules/agent_orchestrator/AGENTS.md`
   ("The Process Model"). Therefore an OSS baseline using core workflows plus an
   agency-owned executor is the intended F54 path; it must not claim an
   Enterprise `AgentRun` exists.

2. **A code-defined worker is an honest domain actor in this slice.** F54-1 says
   the baseline uses "własnych wykonawców agentów" and does not require a worker
   table. The current module gives the worker a stable agency-owned ID
   (`AGENCY_AGENT_WORKER_ID`), persists that ID on `AgencyCase.agentWorkerId`,
   copies it into workflow input, and requires the exact literal at execution:
   `agency_operations/workflows.ts`, `data/entities.ts`, and
   `lib/agencyCaseWorkflowService.ts`. This is sufficient identity for one
   immutable slice-one worker. It is not a staff/auth principal and must not be
   presented as one. A future configurable/multiple-worker registry can justify
   a new entity later; adding one now would duplicate no platform contract and
   would be speculative.

3. **`EXECUTE_FUNCTION` output is durably persisted in the current design.**
   Core's executor returns `{ executed, functionName, result }` from
   `executeFunction`:
   `packages/core/src/modules/workflows/lib/activity-executor.ts:1265-1289`.
   The current agency workflow places that activity on the
   `agent_worker -> end` transition. Core collects successful transition
   outputs by activity name, applies them to the root token, and flushes the
   instance atomically:
   `packages/core/src/modules/workflows/lib/transition-handler.ts:614-635` and
   `:692-715`. Consequently the full result is stored in
   `workflow_instances.context.agentWorkerResult`; the service's
   `completedExecutionSchema` matches the real engine shape.

4. **Do not claim the current worker result is in the step or event record.**
   The `agent_worker` step currently has no `activities`; it completes with the
   generic AUTOMATED step output before the outgoing transition runs. Its
   `StepInstance.outputData` therefore does not contain the function result.
   `STEP_EXITED` persists only `hasOutput`, and the successful transition event
   persists activity counts, not the returned payload:
   `packages/core/src/modules/workflows/lib/step-handler.ts:238-260` and
   `packages/core/src/modules/workflows/lib/transition-handler.ts:800-818`.
   Workflow instance + step + events are collectively real run evidence, but in
   the current layout the **input and full worker output are on the workflow
   instance context**, while steps/events prove lifecycle. T03 must read that
   exact location. If step-level worker evidence is required, move
   `EXECUTE_FUNCTION` onto `agent_worker.activities`; core then persists the
   returned envelope under `StepInstance.outputData.activityResults` through
   `step-handler.ts:792-808` and `:225-245`, but the service must query that step
   because automated-step output is not automatically merged into instance
   context.

5. **The current test is not proof of real engine persistence.**
   `agency_operations/__tests__/workflow.test.ts` mocks both `EntityManager` and
   `workflowExecutor`, and supplies a fabricated completed context. It proves
   workflow definition shape, deterministic function behavior, and service
   wiring only. It does not prove code-workflow discovery, DI execution,
   transaction/persistence, terminal workflow status, or the durable output
   shape. T01's done criterion remains unproven until a focused test/runtime
   scenario runs the actual `workflowExecutor` with the actual registered code
   workflow and reloads `WorkflowInstance` (plus its step/events) from the
   database. T04 may later prove the broader browser seam, but this mock-only
   unit test cannot be cited as T01's real-integration evidence.

6. **Make the deterministic output explicitly no-op.** The current result
   `{ accepted: true, input }` is deterministic and makes no write, but
   `accepted` can be misread as an agency/client decision. The stated domain
   says the first worker makes no marketing decision. Prefer an explicit stable
   no-op result such as `kind: 'no_op'`/`unchanged: true` and include the worker
   ID; this keeps the demo honest without adding an `AgentRun` or a decision
   entity.

7. **Attachments remain platform-owned and need no slice-one material table.**
   The public service accepts scoped storage with an owner pair
   `{ entityId, recordId }`, and provides scoped reads with an exact expected
   owner and optional private-partition requirement:
   `packages/core/src/modules/attachments/lib/attachment-service.ts:100-175`.
   The attachment row already stores owner, tenant/org scope, filename, MIME,
   size, storage driver/path and URL:
   `packages/core/src/modules/attachments/data/entities.ts:51-100`.
   T02 should call `readUploadForm()`, then `createScoped()` with owner
   `agency_operations:agency_case` + the case ID in a private partition, and
   later gate bytes through `readScoped()` with the same owner. That is real
   attachment storage and association, not a mock. A separate `Material` table
   is justified only when later stories need agency-owned provenance/version or
   review state beyond the platform attachment record.

8. **Portal/TOV boundary is currently clean, with one handoff caveat.** No
   portal page/API/auth implementation and no tone-of-voice/style domain code
   exists under `agency_operations`; those concerns have not crept into T01.
   `setup.ts` already declares future `portal.agency_cases.*` default grants.
   Those grants are a supported customer-accounts extension
   (`customer_accounts/AGENTS.md`, "Cross-Module Feature Merging"), but they are
   not portal proof and should be finalized with the teammate-owned T02 routes
   and page metadata so the same feature constants are actually enforced.

9. **The public workflow extension points are being used rather than copied.**
   `workflows.ts` uses `defineWorkflow`/`createWorkflowsModuleConfig`, which the
   generator discovers into `workflows.generated.ts`, and `di.ts` registers the
   runtime key expected by `EXECUTE_FUNCTION`. It also registers the descriptor
   with `registerWorkflowFunctions`, so the function is visible through the
   platform's function catalog instead of being a hidden DI-only implementation.

## Coordinator action

Keep the one-entity baseline. Before accepting T01, choose and document one
truthful evidence layout:

- current lean layout: transition activity, full result in
  `WorkflowInstance.context`, step/events are lifecycle evidence; or
- semantically stronger worker-step layout: function on the automated step,
  full result in `StepInstance.outputData`, with a scoped reader for it.

Whichever is chosen, replace the ambiguous `accepted` output and add one actual
engine/database proof. Do not add portal UI/auth or tone/style behavior to T01.
