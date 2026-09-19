---
id: AC2
story: F55-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Osoba bez uprawnienia do danej sprawy nie uzyskuje jej danych ani możliwości zmiany decyzji przez podmianę ID.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Exact invited document and customer task checks reject foreign ID substitution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
