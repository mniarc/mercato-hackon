---
id: AC5
story: F43-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Liczba wcześniejszych poprawek w zakresie nie powoduje odmowy ani dodatkowego checkoutu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/analysisProcess/contracts.ts` — Technical attempt limits are separate from review requests and no revision-price rule is implemented.

## Missing

- No complete in-scope revision flow yet demonstrates unlimited bought-scope revisions.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
