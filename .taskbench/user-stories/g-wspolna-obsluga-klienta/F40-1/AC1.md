---
id: AC1
story: F40-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Zgłoszenie ma ID, oryginalną treść, załączniki lub odwołania, nadawcę, czas, kanał i identyfikator zdarzenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientSubmissionService.ts` — Persists scoped original input, sender, event identity, time and attachment/version references.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/clientMaterialIntakeService.ts` — Supplement upload saves immutable original text, attachment, authenticated sender, portal channel and event identity on the existing owned case.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Native TC002 passed authenticated paid-case upload and asserted the exact private source text and identity before the later 3.4 fixture mismatch.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
