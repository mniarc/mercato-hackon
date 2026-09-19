---
id: AC5
story: F09-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Poprawka w zakupionym zakresie nie powoduje dopłaty, checkoutu ani odmowy z powodu liczby wcześniejszych rund.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — Revision service has explicit execution cap but no checkout or client-round counter.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the initial exact brief was needs_client_data with genuine questions and acceptance disabled; the authenticated client answered in the native UI, a different version became ready_for_approval, and that exact version was explicitly accepted without another checkout. Local intelligence fixture, not live-model proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
