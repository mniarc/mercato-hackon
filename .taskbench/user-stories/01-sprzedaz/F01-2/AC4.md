---
id: AC4
story: F01-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Pytanie o cenę nie powoduje uruchomienia audytu ani udostępnienia bezpłatnej analizy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/sales-advisor/definition.ts` — Sales prompt forbids audit/free-analysis activation.

## Missing

- Connect sales route while retaining the non-execution boundary.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
