---
id: AC2
story: F39-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Zamówienie otrzymuje status zrealizowanego wraz z datą dostawy, finalnymi wersjami, dowodami i powiązaniem z pierwotną potwierdzoną płatnością.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/closure.ts` — Step explicitly only records verdict; case.close belongs to unimplemented spine.

## Missing

- Persist fulfilled order/case with delivery date, final versions/proofs and original native payment link.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
