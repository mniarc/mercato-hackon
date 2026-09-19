# T101 — Show the current customer action inside its agency case

State: active (P0; scoped native task projection implemented, coordinator proof pending)
Sources: F10-1 AC1–4; F24-1 AC1–4; F27-2; F32-1; F49-2 AC4; F52-1 AC3–5.

The case currently exposes intake/workflow status and an unfiltered native task
inbox link. That inbox defaults to 25 visible tasks and has no case filter. A
customer cannot reliably see which actual question/review is next for this case.
Do not infer that answer from workflow status, task title, or latest document.

Reuse native portal principal/access predicates and actual scoped invitation,
question and workflow bindings. Add one customer-safe case task/continuation read
projection, exposing real task IDs/status and the supported waiting reason only.
Render current action links in the existing case view; keep native task renderers,
exact version approval and existing G/E ownership. No employee-only context leak,
new lifecycle, guessed invitations, or full workflow JSON in the portal.

Suggested exclusive scope: `agency_operations/lib/clientCaseTasks/**`, thin
`agency/api/portal/cases/[id]/tasks/**`, small case-view component. Coordinator owns
DI/contracts if shared. Verify customer/company/tenant isolation and one real
question/review → same-case continuation, with assigned-only completion unchanged.
No requirement to run every conditional agent or manufacture all task types.
