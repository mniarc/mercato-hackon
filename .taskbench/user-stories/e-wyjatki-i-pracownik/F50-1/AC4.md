---
id: AC4
story: F50-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Wznowienie nie restartuje całego zamówienia i nie powtarza wykonanej publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Workflow supports continued hold only; no actual resumed producer execution.

## Missing

- No implemented scoped recovery to prove no whole-order restart or repeated send.

## Decision Required

- T24/T45: approve the specific producer return step, additional guided-attempt allowance and remaining-versus-new budget accounting; no implicit retry authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
