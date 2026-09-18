# Agency operations platform reuse

The baseline vertical slice follows F54 without requiring Enterprise features.

## Own

- `agency_operations` owns only the `AgencyCase` record and its use-case code.
- The deterministic worker is a stable code identity, not a duplicate user or staff
  record.
- Portal and employee UI stay in separate module-local feature directories.

## Reuse

- Client identity and tenancy: Open Mercato customers and customer accounts.
- Employee identity and access: Open Mercato auth, staff roles, and feature ACLs.
- Submitted files: Open Mercato attachments; store attachment IDs, not copied blobs.
- Execution: the public workflows contract, a code-defined workflow, and the built-in
  `EXECUTE_FUNCTION` activity resolved through public DI.
- Run evidence: persisted workflow instance, step, activity, event, and context data.

The intake command creates the case, starts and executes the real workflow, and stores
its workflow instance ID on the case. The deterministic function accepts the material
input unchanged and writes its output into persisted workflow context. This is workflow
execution evidence; it is not presented as an Enterprise Agent Run.

With `EXECUTE_FUNCTION` on the worker-to-end transition, the full result is stored
at `WorkflowInstance.context.agentWorkerResult`. The worker step contains generic
execution output and workflow events contain lifecycle evidence, not that payload.
Acceptance therefore requires a real engine/database execution that reloads the
instance context, steps, and events; a mocked executor unit test is not proof.

## Boundaries

- Workflow execution is reached through one module-local bridge/service.
- Attachment lookup is reached through one module-local bridge when intake is added.
- A teammate owns portal auth, routes, and UI. Their server adapter will call one
  trusted intake contract; this module does not add a substitute HTTP endpoint.
- Employee routes call module use cases and never reach into portal code.
- Domain code has no UI imports or direct imports from another module's internals.

The future portal adapter derives tenant, organization, customer, submitter, and
optional person IDs from its authenticated server context; the browser supplies
only the file. The intake contract stores that file through
`attachmentService.createScoped`, assigns and owns it as
`agency_operations:agency_case/<caseId>`, and persists its ID plus filename,
MIME type, and size snapshot in `persistLink`.

Another teammate owns tone of voice. This module therefore owns no tone profile,
prompt, field, rule, UI, or processing behavior. Its deterministic worker is an
explicit content-neutral no-op.

Only add a bridge for an integration seam used by the slice. Enterprise Agent
Orchestrator can later replace the execution side of the workflow bridge, but it stays
optional and disabled in the baseline.

## Platform contracts

- Workflow definitions use `@open-mercato/shared/modules/workflows`.
- Runtime code resolves `workflowExecutor`, calls `startWorkflow`, then
  `executeWorkflow`.
- Deterministic workflow functions are registered in module `di.ts` as
  `workflowFunction:<functionName>`.
- Staff features belong in `acl.ts`; portal feature IDs belong in
  `setup.ts.defaultCustomerRoleFeatures`.
