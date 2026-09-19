---
id: AC4
story: F51-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Limit obliczeń lub retry nie jest licznikiem rund poprawek klienta ani podstawą dopłaty.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/contracts.ts` — Technical phase/repair limits are separate from client requests and payment flows; no customer revision counter or surcharge is derived from those limits.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
