---
id: AC4
story: F55-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Odmowa dostępu nie zmienia dokumentu, stanu akceptacji ani stanu wyjątku.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Authorization and scoped target lookup occur before mutation; refusal does not approve or alter the case.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
