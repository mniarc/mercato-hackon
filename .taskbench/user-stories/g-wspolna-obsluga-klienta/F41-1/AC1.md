---
id: AC1
story: F41-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

System porównuje nadawcę i wskazany kontekst z kontaktem oraz zamówieniem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Customer account and case customer identity are checked under tenant/organization scope.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts` — The authenticated sender, tenant, organization, customer entity and selected case must match before bytes or a submission are stored.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Native TC002 passed the authenticated signup-to-paid-case upload path and exact case-bound private source identity assertions.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
