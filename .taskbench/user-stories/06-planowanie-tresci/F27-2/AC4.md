---
id: AC4
story: F27-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Odpowiedź trafia do G.1, a lokalna obsługa korzysta później z dyspozycji 6.5; rekomendacja nie zastępuje wyboru klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/planReview/service.ts` — Original task response passes shared G; recommendation is never substituted for client topic.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
