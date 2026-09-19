---
id: AC2
story: F12-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

System potwierdza uprawnienie kontaktu, identyfikator aktualnej wersji i brak sprzecznego polecenia zmiany.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/briefApproval.ts` — Scoped G adapter binds customer/task/original response and rejects conflicting/stale target.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the initial exact brief was needs_client_data with genuine questions and acceptance disabled; the authenticated client answered in the native UI, a different version became ready_for_approval, and that exact version was explicitly accepted without another checkout. Local intelligence fixture, not live-model proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
