---
id: AC1
story: F41-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przed wykonaniem dyspozycji akceptacji system sprawdza aktualną wersję i uprawnienie kontaktu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Exact invited pair freshness and native customer task authority are rechecked before accepting response.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
