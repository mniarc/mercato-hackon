---
id: AC2
story: F49-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Zapis obejmuje pracownika, czas, rozstrzygnięcie, uzasadnienie i dowody rozwiązania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Native task records actor/time/decision and required hold reason.

## Missing

- No evidence-bearing producer resolution write or linked resolution receipt for decisions that remove the obstacle.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
