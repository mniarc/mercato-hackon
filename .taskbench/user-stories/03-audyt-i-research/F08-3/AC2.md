---
id: AC2
story: F08-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

W OM etap audytu ma jawne przekazanie dokumentów do 4.1 i widoczny zestaw ich wersji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/freeze.ts` — Persisted freeze and employee research view expose handoff references.
- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — T64 commit 52595d8b0: employee ledger renders frozen handoff input_versions and navigates exact persisted versions, never latest fallback. Nine focused T64 checks passed; connected staff handoff view not run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
