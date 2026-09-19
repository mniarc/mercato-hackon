---
id: AC3
story: F40-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Oryginał i decyzja pozostają w WEW-ZGLOSZENIE bez tworzenia WEW-ZMIANY nieuruchomionego zamówienia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Immutable originals exist only in the case-bound submission flow.

## Missing

- No separate pre-order submission lifecycle.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
