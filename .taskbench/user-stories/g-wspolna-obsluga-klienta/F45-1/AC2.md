---
id: AC2
story: F45-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Decyzja zostaje zapisana w WEW-ZGLOSZENIE, a dla uruchomionego zamówienia również w WEW-ZMIANY.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Native submission and workflow context persist interpretation and disposition.

## Missing

- No complete WEW-ZMIANY record for running-order business changes.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
