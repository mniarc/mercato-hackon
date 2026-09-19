---
id: AC2
story: F32-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Może zaakceptować treść, zgłosić poprawkę, zadać pytanie lub wstrzymać pracę; odpowiedź trafia do G.1.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/postReview/service.ts` — Portal accepts explicit content approval or original free-text corrections/questions/hold requests and forwards the exact response to G; downstream execution assessed under F33.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
