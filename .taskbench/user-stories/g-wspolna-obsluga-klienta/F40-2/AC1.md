---
id: AC1
story: F40-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Przed zakupem wymagane powiązanie obejmuje kontakt i produkt; zamówienie pozostaje opcjonalne.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Current service requires caseId and a customer-linked agency case.

## Missing

- No prepurchase contact/product submission without an order/case.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
