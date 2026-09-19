---
id: AC4
story: F11-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Powtórzenie tego samego zdarzenia aktualizacji nie dubluje przekazania do briefu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/claim.ts` — Saved submission identity and request hash deduplicate in-progress and completed 4.5 execution; a changed replay is rejected.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/__tests__/claim.test.ts` — Focused checks claim a submission once and do not start another task on replay.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
