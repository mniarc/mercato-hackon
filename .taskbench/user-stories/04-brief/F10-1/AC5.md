---
id: AC5
story: F10-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Kontrakt wersji i odpowiedzi nie zależy od tego, czy zespół wybierze mail czy panel; historia nie zakłada wdrożenia obu interfejsów.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefStrategyProcess/service.ts` — Server review/response contracts are channel-independent; chosen portal adapter is real.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
