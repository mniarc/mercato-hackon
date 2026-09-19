---
id: AC4
story: F06-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Przyjęcie źródła nie nadaje automatycznie prawdziwości jego twierdzeniom ani nie oznacza akceptacji wyniku przez klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/fetch.ts` — Source provenance/proof permissions remain distinct from fact truth and document approval.
- `ai-company/apps/mercato/src/modules/agency_research/lib/materialRevision/__tests__/append.test.ts` — Focused checks append private evidence while preserving prior client decisions; accepting a file does not turn its claims into client approval.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
