---
id: AC2
story: F40-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Po zakupie zgłoszenie jest powiązane z zamówieniem i wskazaną wersją dokumentu, jeśli jej dotyczy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts` — Supplement intake accepts only an existing customer-owned case, preserving the paid order case rather than creating another case.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/binding.ts` — When the material concerns the current brief, the saved native disposition binds the submission to that exact brief version reference before effects run.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the authenticated private-material submission was saved on the same paid case/order, preserved its real attachment ID and client_private/full source identity, and entered native triage.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
