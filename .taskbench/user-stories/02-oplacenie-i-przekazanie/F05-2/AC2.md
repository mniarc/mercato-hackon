---
id: AC2
story: F05-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Instancja ma przypisane wersje produktu, STD-PROCES i STD-LIMITY oraz pusty WEW-ZMIANY utworzony z WZR-ZMIANY.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Purchase attachment pins demo offer/terms and workflow version.

## Missing

- Pin production STD-PROCES/STD-LIMITY and create initial WEW-ZMIANY.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
