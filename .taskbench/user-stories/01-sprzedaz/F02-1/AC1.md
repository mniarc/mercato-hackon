---
id: AC1
story: F02-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Formularz zapisuje kontakt, nazwę firmy i marki, adres WWW, dane rozliczeniowe oraz jeden rynek i jeden język zgodnie z WZR-ZAMOWIENIE i STD-OFERTA.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/contracts.ts` — Buyer schema stores contact, brand/company, website, billing, one market/language under fixed product; positive form submission proved. 
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — TC003 headed native zero-charge mock_processing purchase proof passed; commit 0893b2fe5. Not live payment or research fulfilment.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
