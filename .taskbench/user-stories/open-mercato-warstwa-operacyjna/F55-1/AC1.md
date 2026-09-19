---
id: AC1
story: F55-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Kontrola dostępu obejmuje bezpośrednie odwołanie do zamówienia, dokumentu, zgłoszenia i wyjątku.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Case/customer ownership gates intake and direct API paths; research reads and native tasks use tenant/organization scope.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
