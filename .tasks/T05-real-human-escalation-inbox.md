# T05 — Route attention work to humans

State: ready
Depends on: T03
Owns: the smallest `agency_operations` workflow extension and task-context widget
needed for a real escalation; no new task table or taskboard
Context: The employee workspace is an attention layer. Routine agent work stays
automated; escalations and explicitly important-client work go to humans.

## Deliver

- Reuse workflow `UserTask` and `/backend/work-inbox` for a prioritized human
  assignment.
- Include escalation reason and evidence, and bind the task to the existing
  customer company profile using the case customer ID.
- Show case/material/run context through the
  `workflows.task.detail:context` widget position.
- Support a normal decision transition that can complete the work or return it to
  a later automated agent step.

## Done when

- An attention-worthy case appears in the real work inbox, can be assigned or
  claimed by an authorized employee, and preserves the workflow audit trail.
- Routine no-op runs create no human task.
- Focused workflow/task tests and one real browser scenario pass.

## Constraints

- No agency-owned task table, generic Kanban, customer portal, or tone-of-voice
  behavior.
- Reuse native assignment, claim/release, priority, notification, SLA, and
  completion behavior; do not wrap or copy it.

## Handoff

Report the reused contracts, changed files, focused proof, and the next missing
attention-policy seam.

## Current boundary

Not implemented: the current workflow has only START, automated no-op, and END.
Neither the merged portal scaffold nor the ToV research lane supplies human
escalation. Keep this as the next independent employee capability; reuse findings
are in `../.dev-docs/info-foraging/findings-synthesized/employee-escalation-platform-reuse.md`.
