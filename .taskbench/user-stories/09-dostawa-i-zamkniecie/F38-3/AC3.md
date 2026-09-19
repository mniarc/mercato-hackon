---
id: AC3
story: F38-3
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Udostępnienie korzysta z kontaktu przypisanego do zamówienia i docelowo wybranego kanału obsługi; wybór mail albo panel pozostaje nierozstrzygnięty.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — Delivery is initialized not_executed.

## Missing

- Implement agreed portal/mail sharing with assigned contact.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
