# T100 — Connect the customer and employee journey

State: active (P0; source implementation, runtime proof coordinator-owned)
Sources: F01-1 AC5; F10-1 AC1–4; F24-1; F27-2; F32-1; F49-2; F52-1 AC3–5.

Make the existing real journey discoverable without manual URL jumps: native login
dashboard → offer/cases/tasks; paid case → case-selected material upload; exact
review → originating case/materials and native task list; employee case → scoped
specialist intake → same case. Preserve native identity, assignment, approvals,
payment and producer semantics. Remove the canned review-demo shortcut from the
real task landing; keep the explicit demonstration route available separately.

Owns: agency `components/journey/**`, dashboard/tasks wrappers, task/review return
navigation, `route-overrides.ts`, customer case/material page navigation, own EN/PL
keys; coordinated staff `AgencyCaseProcess.tsx`/`StaffTovIntake.tsx` navigation only.
No shared backend contracts, workflow graph, T95 harness or native auth rewrites.

Reuse: native portal dashboard/task pages, existing route overrides and scoped
review projections, uploader's existing `caseId` query, native Buttons/portal cards.
Design references: `ai-company/docs/design-system/principles.md` and existing
Open Mercato portal/UI guidance; no `.design` directory was found in this checkout.
Preserve teammate Polish copy/layout. New copy only explains navigation, not new policy.

Done: real same-case return/upload links and staff continuation discoverable;
dashboard leads into actual agency work; focused navigation checks authored and
coordinator-verified. Remaining native auth resume-intent or missing backend actions
must be reported explicitly, not replaced with fake next steps or story-wide claims.
