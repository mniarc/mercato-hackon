---
id: AC3
story: F53-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Przy akceptacji można ustalić osobę, czas i konkretną wersję; przy publikacji również cel i dowód wykonania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — Acceptance person/time/version is read from stored records.

## Missing

- Actual publication target/provider proof is unavailable.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
