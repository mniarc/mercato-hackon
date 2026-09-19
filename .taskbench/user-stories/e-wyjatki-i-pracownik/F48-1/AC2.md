---
id: AC2
story: F48-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Sprawa ma właściciela, oczekiwaną decyzję, dopuszczalne rozstrzygnięcia i wskazany punkt wznowienia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Native employee task has role ownership, expected decision and producer return evidence.

## Missing

- Only keep_blocked is actionable; producer-listed additional resolutions lack connected execution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
