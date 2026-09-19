---
id: AC5
story: F01-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Klient może przejść do danych zakupu lub zadać pytanie; pytanie trafia do G i obsługi sprzedaży.

## Evidence

- `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/page.tsx` — Portal links to purchase form; sales-advisor exists as a proposal scaffold.

## Missing

- Connect pre-purchase question to G, catalogue-bound response and contact/product history.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
