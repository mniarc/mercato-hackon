---
id: AC2
story: F10-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

W OM widoczne są wysłana wersja, stan oczekiwania na klienta i powiązane zgłoszenie odpowiedzi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefStrategyProcess/service.ts` — Native task+portal review and received response are saved; TC001 proves seeded-brief invitation/response only.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the initial exact brief was needs_client_data with genuine questions and acceptance disabled; the authenticated client answered in the native UI, a different version became ready_for_approval, and that exact version was explicitly accepted without another checkout. Local intelligence fixture, not live-model proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
