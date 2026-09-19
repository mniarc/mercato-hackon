---
id: AC3
story: F10-3
status: unassessed
blocking: true
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

OM pokazuje wybraną ścieżkę, uzasadnienie i wersje powiązane z jedną decyzją G.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Saved G interpretation/revision result retain rationale and exact versions.
- `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/researchLineage/ResearchLineage.tsx` — T64 implements exact version/history and approval-record navigation, but this inspection does not establish a unified view of one G decision, rationale and chosen path. Presentation implementation remains unassessed, not asserted missing; no native UI proof.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
