---
id: AC5
story: F01-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Po odpowiedzi klient może dopytać, przejść do danych zakupu albo zakończyć rozmowę; agent nie zakłada decyzji o zakupie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/sales-advisor/definition.ts` — Proposal scaffold does not provide a follow-up sales conversation.

## Missing

- Allow follow-up, purchase or exit without inferred purchase.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
