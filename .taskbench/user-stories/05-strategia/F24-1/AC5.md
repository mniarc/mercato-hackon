---
id: AC5
story: F24-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Kontrakt decyzji jest niezależny od wyboru maila albo panelu; ten wybór pozostaje otwarty.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Response contract separates channel and exact document pair; current implementation uses portal, not both channels.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
