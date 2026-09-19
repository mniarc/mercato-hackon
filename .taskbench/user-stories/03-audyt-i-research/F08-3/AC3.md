---
id: AC3
story: F08-3
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Powtórzenie przekazania dla tego samego zamówienia i zdarzenia aktualizacji nie uruchamia kolejnej realizacji briefu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/freeze.ts` — Same analysis set reuses freeze task; native initial-analysis refuses rerun when persisted tasks exist.

## Missing

- Recover an interrupted handoff without either duplicate brief execution or generic reconcile error.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
