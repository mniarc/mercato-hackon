# T37 - Show persisted research work inside the employee case

State: active (read integration committed; positive partial-output browser proof pending)
Depends on: T26 case-ID order reference; merged teammate research read APIs
Owns: `ai-company/apps/mercato/src/modules/agency_operations/backend/agency-operations/cases/[id]/_components/AgencyCaseResearchLedger.tsx` and its adjacent test; coordinator owns the `AgencyCaseDetail.tsx` mount and `agency_operations/i18n/*.json` research-ledger keys
Sources: F52-1 AC2/3/5, F53-1 AC1/4, F55-1; teammate research public read APIs
Context: Analysis uses `orderRef=caseId`. The existing case process panel exposes native state and a saved final handoff, but not research task rows persisted before a failed/partial return.
Evidence: 09a311a47 contains the mounted read-only ledger, five focused component checks and composed case-view checks; app typecheck passes. The canonical native demo visits the integrated employee case. A real partial research record still needs browser proof; no paid run is authorized.

## Deliver

- In the existing loaded employee case, use `apiCall` with the actual case ID to
  read `/api/agency_research/task-runs?order_ref=...`. Show recorded step, attempt,
  status, error, spend and output-version references; manual refresh is sufficient.
- For a selected returned output version, use the existing
  `/api/agency_research/document-versions?id=...` endpoint and existing `JsonDisplay`
  to inspect stored data/dependencies/QA. Do not build a document renderer or fetch
  every version eagerly. Preserve recorded status: generated or QA-ready is not
  customer-accepted.
- Handle empty, unavailable and forbidden results without hiding the rest of the
  case. Clear stale results on case/organization switch. The existing APIs enforce
  `agency_research.documents.view`; do not grant it or duplicate their data layer.

## Done when

- A case shows persisted research attempts and one selected exact output even
  without a completed native activity result. Focused UI checks cover that partial
  state, API denial and stale-result clearing; runtime proof is coordinator-owned.

## Constraints

- Read-only staff surface, independent of T36 portal paths. No model calls, retry,
  resume, new research API/entity, direct database reads, status inference from
  counters, or claim of full F52/F53 completion. Unavailable research stays explicit.
