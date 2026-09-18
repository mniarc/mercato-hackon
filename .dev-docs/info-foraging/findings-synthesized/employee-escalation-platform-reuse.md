# Employee escalation platform reuse

Employee attention work uses the OSS workflows module. Do not create an agency
task table or a second taskboard.

## Reuse

- Workflow `UserTask` records for human-attention work.
- `/backend/work-inbox` for priority ordering and employee task detail.
- Native role or specific-user assignment, atomic claim/release, audited
  reassignment, SLA/notifications, and task completion.
- A normal task decision transition such as `return_to_agent` to resume an
  `AUTOMATED` step backed by `EXECUTE_FUNCTION`.

Only escalations and explicitly important-client work enter the inbox. Routine
agent runs do not create human tasks.

## Agency-owned seam

- The workflow supplies escalation reason, priority, and evidence in task context.
- Bind the task to the existing `customers:customer_company_profile` using the
  case's `customerEntityId`; do not bind only to `agency_operations:agency_case`
  until the platform exposes an additive entity-ACL registration contract.
- Add a narrow agency widget at `workflows.task.detail:context` to show linked
  case, material metadata, and workflow evidence.

Customer portal and tone-of-voice behavior remain outside this module's ownership.
