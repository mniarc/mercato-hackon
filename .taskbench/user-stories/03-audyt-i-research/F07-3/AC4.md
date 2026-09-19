---
id: AC4
story: F07-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

W OM widoczne są powiązane zadania audytu i researchu oraz uzupełniona analiza konkurencji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/AgencyCaseResearchLedger.tsx` — Research task runs and exact document input versions are persisted and available to employee inspection.
- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — T64 commit 52595d8b0: mounted in employee research ledger, links task outputs to exact document inputs/history, including audit and competitor outputs. Nine focused T64 checks passed; native staff journey not run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
