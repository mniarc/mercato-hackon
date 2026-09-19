---
id: AC4
story: F53-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Stan „wymaga przeglądu” nie jest mylony ze stanem „zaakceptowany”; wcześniejsze akceptacje pozostają w historii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — Version history keeps prior acceptance and distinguishes draft/review states from approval.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
