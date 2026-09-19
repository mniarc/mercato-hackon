---
id: AC5
story: F10-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Klient otrzymuje wynik wtedy, gdy potrzebna jest jego odpowiedź lub nowa akceptacja; lokalna dyspozycja nie tworzy dodatkowej bramki zatwierdzenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Actual QA outcomes return unanswered questions or exact new review; no routine staff approval gate.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19. The resulting QA-ready brief was invited for a separate explicit approval. Local intelligence/source fixtures, not live-model proof; alternative paths are not covered by this run.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
