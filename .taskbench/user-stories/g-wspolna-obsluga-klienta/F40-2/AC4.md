---
id: AC4
story: F40-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Pytanie o pakiet nie uruchamia bezpłatnego audytu ani realizacji usługi.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — No public question route starts free analysis.

## Missing

- The required prepurchase question path itself is absent; lack of that path is not full behavior coverage.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
