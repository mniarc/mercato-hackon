---
id: AC2
story: F47-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Przygotowanie poprawionej treści nie tworzy automatycznie drugiej publikacji ani nowego zakupionego rezultatu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/publicationPreparation/prepare.ts` — Preparation never sends or creates another sale.

## Missing

- No actual post-publication revision pathway.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
