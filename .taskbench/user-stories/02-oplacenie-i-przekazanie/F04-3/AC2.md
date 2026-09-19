---
id: AC2
story: F04-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Niezgodność transakcji lub nierozwiązany błąd tworzy sprawę E.1 z identyfikatorem transakcji, powodem i dowodami.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/payment.ts` — Mismatch path returns blocked receipt; no payment-specific E.1 creation found.

## Missing

- Create transaction-evidence-linked employee exception for unresolved mismatches.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
