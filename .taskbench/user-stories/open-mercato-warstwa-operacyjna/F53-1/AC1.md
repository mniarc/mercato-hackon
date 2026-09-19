---
id: AC1
story: F53-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Dokument ma identyfikator, wersję, status, źródło i powiązania z użytymi wersjami dokumentów wejściowych.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — Research document/version envelope and lineage view expose persisted IDs, state, source task and exact input versions.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
