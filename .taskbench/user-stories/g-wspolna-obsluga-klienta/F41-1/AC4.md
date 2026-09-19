---
id: AC4
story: F41-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Nierozstrzygnięty spór o uprawnienie kontaktu trafia do E.1; samo oczekiwanie na odpowiedź klienta nie tworzy sprawy pracownika.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Native exception route handles saved producer faults, not unresolved contact authority disputes.

## Missing

- Authority-dispute evidence and E.1 handoff are not connected.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
