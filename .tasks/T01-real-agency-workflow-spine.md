# T01 — Build the real agency workflow spine

State: active
Depends on: none
Owns: `ai-company/apps/mercato/src/modules/agency_operations/**`, `ai-company/apps/mercato/src/modules.ts`, `ai-company/eslint.ds.config.mjs`, generated module artifacts
Context: Create the smallest real Open Mercato module behind the slice. See F52,
F54, and F55 only as context.

## Deliver
- Persist only the agency-owned case, using platform IDs for customer/contact/
  staff identities and no cross-module ORM relations.
- Represent the stable agent worker in module code. Reuse Open Mercato attachments
  for material and workflow instance/step/event records for run evidence; do not
  duplicate those platform entities.
- Register `agency_operations` and a real `START -> deterministic agent
  worker -> END` code workflow using the built-in `EXECUTE_FUNCTION` activity.
- Start it through `workflowExecutor`, save the workflow instance and run
  evidence, and make no model or external AI call.

## Done when
- A scoped case assigned to the stable code-defined worker completes the real
  workflow and has saved input/output evidence in Open Mercato workflow records.
- `yarn generate && yarn workspace @open-mercato/app test --runInBand apps/mercato/src/modules/agency_operations/__tests__/workflow.test.ts` passes.

## Constraints
- Only the agent intelligence is stubbed; persistence and workflow are real.
- Keep Enterprise Agent Orchestrator optional and disabled for this baseline, as
  required by F54. Do not claim an Enterprise `AgentRun` exists.

## Handoff
Report changed files, verification result, generated artifacts, and assumptions.
