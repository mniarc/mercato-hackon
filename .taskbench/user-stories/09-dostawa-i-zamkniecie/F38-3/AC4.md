---
id: AC4
story: F38-3
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Zapis przekazania obejmuje odbiorcę, listę rezultatów i wersji, czas, sposób oraz potwierdzony wynik techniczny albo blokadę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — Delivery schema reserves recipient/channel/time/evidence fields.

## Missing

- Write them from actual successful/failed sharing adapter result.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
