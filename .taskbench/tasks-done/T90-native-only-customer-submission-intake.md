# T90 — Keep customer responses native or honestly pending

State: done
Sources: F40-1 AC1–4; F42-1 AC1, AC3, AC5
Owns: `agency_operations/lib/clientSubmissionService.ts`, its submission contract/tests;
the portal case conversation's pending-state rendering and new localized labels.

Replace the reachable disabled-triage → deterministic-scaffold fallback shared by
case messages and exact document review responses. Reuse T74's native-or-saved
pending boundary: preserve the immutable original and event identity when native
triage/configuration is unavailable, expose waiting configuration, and invoke only
the real configured native G path when available. A stored pending response may be
started only through the existing trusted `startPending` option; ordinary replay
does not execute or replace its original.

Keep historical scaffold receipts readable. New deterministic execution requires
an explicit server test option and `NODE_ENV=test`; public input cannot enable it.
Native model fixtures remain native execution. No approvals, budgets or retries
are inferred; no new worker, queue or entity.

Done when normal messages and review responses remain saved without a fake
disposition/configured workflow, native execution/replay stays unchanged, and the
portal distinguishes configuration waiting from an actual recorded response.
Verified: native Jest `--runInBand --runTestsByPath` passed the existing
`clientSubmissionService`, `CaseConversation`, and client-triage `configuration`
suites: 3 suites / 29 tests, exit 0 (2026-09-19). This proves the focused service,
rendering and configuration seams, not a joined native application journey or
live-model execution.
