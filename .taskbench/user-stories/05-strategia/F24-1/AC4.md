---
id: AC4
story: F24-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

System zapisuje przekazaną parę i stan oczekiwania na decyzję, nie traktując samego wysłania jako akceptacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/strategyPairReview/service.ts` — Native workflow/task persists shown pair and waits; send is not acceptance.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. The pair was invited before, and separately from, the client's explicit approval. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
