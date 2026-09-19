---
id: AC4
story: F12-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

OM pokazuje przekazanie między działami i dokładny zestaw aktualnych wersji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyReadiness/resolve.ts` — Readiness result records exact versions and native handoff retains references.
- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — T64 commit 52595d8b0 adds exact input-version/history navigation and recorded decisions to employee research ledger; 9 focused checks and app typecheck passed. Together with persisted strategy handoff/readiness references, the exact handoff version set is inspectable; no connected native UI pass claimed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
