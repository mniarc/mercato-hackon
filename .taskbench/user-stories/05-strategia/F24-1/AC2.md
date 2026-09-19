---
id: AC2
story: F24-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Może zaakceptować oba, zgłosić uwagi do jednego lub obu, zapytać, wstrzymać pracę albo zmienić kierunek.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Portal accepts explicit separate approvals or original free-text comments/questions/hold/direction requests; applied downstream routing is assessed under F25.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
