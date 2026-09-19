---
id: AC3
story: F49-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Dopiero odpowiedź klienta stanowi wejście do G.1 i przechodzi właściwą kwalifikację.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/employeeQuestions/service.ts` — Only the customer response creates original intake and enters native G.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
