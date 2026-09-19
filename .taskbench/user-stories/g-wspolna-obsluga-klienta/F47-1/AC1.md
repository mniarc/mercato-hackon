---
id: AC1
story: F47-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Zgłoszenie po dostawie jest przyjęte i powiązane z zamówieniem oraz wersją, której dotyczy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Case-bound intake is not closed when an earlier stage finishes.

## Missing

- No real delivered-case lifecycle/version binding has been connected.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
