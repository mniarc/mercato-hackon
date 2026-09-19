---
id: AC4
story: F42-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Zwykła odpowiedź i jednoznaczna akceptacja mogą przejść do G.5 bez obowiązkowej kontroli zakresu i wpływu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Answer and unambiguous exact-review approval routes do not require blanket scope/impact processing.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: an ordinary brief answer and unambiguous exact-version approvals traversed the native G response path into their authorized next stages without inventing client decisions. Interpretation used the bounded local fixture, not a live model.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
