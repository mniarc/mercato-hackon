---
id: AC3
story: F40-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Ponowne odebranie tego samego zdarzenia nie tworzy drugiego zgłoszenia ani drugiej dyspozycji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Case lock and scoped event-key lookup replay immutable original submission without creating a second workflow.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/__tests__/supplementaryMaterial.test.ts` — Focused replay coverage returns the immutable first submission/attachment for the same event and performs no second upload.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
