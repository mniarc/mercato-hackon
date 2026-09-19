---
id: AC2
story: F44-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Zmiana odbiorcy może skierować pracę do briefu i oznaczyć zależne strategię, TOV, plan i post jako wymagające przeglądu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefRevision/run.ts` — Bound brief answers produce revised findings and a new brief.

## Missing

- No general audience-change invalidation across existing strategy/ToV/plan/post.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
