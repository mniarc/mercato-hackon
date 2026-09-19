---
id: AC2
story: F03-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Ponowienie nie tworzy kolejnego zamówienia ani drugiej sprawy realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-003-demo-purchase.spec.ts` — Headed TC003 passed 2026-09-19, commit eb2eef065: native failed attempt -> real portal retry -> replacement capture; final persistence proves one original order/payment, two retained failed/captured attempts and exactly one waiting case. Fixture cleanup passed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
