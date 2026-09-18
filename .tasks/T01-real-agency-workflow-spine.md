# T01 — Build the real agency workflow spine

State: ready
Depends on: none
Owns: `ai-company/apps/mercato/src/modules/agency_operations/{data/**,services/**,workflows.ts,index.ts,acl.ts,__tests__/workflow.test.ts}`, `ai-company/apps/mercato/src/modules.ts`, generated module artifacts
Context: Create the smallest real Open Mercato module behind the slice. See F52,
F54, and F55 only as context.

## Deliver
- Persist an agent worker, case, material link, and agent run using platform IDs
  for customer/contact/staff identities and no cross-module ORM relations.
- Register `agency_operations` and a real `START -> deterministic agent
  placeholder -> END` code workflow.
- Start it through `workflowExecutor`, save the workflow instance and run
  evidence, and make no model or external AI call.

## Done when
- A scoped case assigned to a stable agent worker completes the real workflow
  and has saved input/output evidence.
- `yarn generate && yarn workspace @open-mercato/app test --runInBand apps/mercato/src/modules/agency_operations/__tests__/workflow.test.ts` passes.

## Constraints
- Only the agent intelligence is stubbed; persistence and workflow are real.
- Keep Enterprise Agent Orchestrator disabled.

## Handoff
Report changed files, verification result, generated artifacts, and assumptions.
