---
id: AC2
story: F01-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Wyświetlana cena i identyfikator wersji pochodzą z STD-OFERTA. Kwota 2500 PLN netto pozostaje propozycją wymagającą ustalenia wersji oferty przed sprzedażą.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/demoOffer.ts` — Versioned demo amount is server-owned and native catalog-backed; real commercial offer remains unapproved.

## Missing

- Replace explicitly simulated offer with approved saleable catalogue version.

## Decision Required

- Approve real catalogue version and net price before real sales.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
