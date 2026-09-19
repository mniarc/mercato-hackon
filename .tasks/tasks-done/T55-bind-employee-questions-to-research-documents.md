# T55 - Ask about the current strategy, ToV or plan

State: done
Sources: F49-2 (AC4); extends T44/T52
Owns: existing employeeQuestions service/contracts and employee question component.

## Deliver

Use the public research status documents to let staff select a saved current
strategy, ToV or plan version for an existing employee-exception question.
Allow draft/QA-blocked documents; asking is not approval. Preserve the exact
binding for replay and customer answers after a newer document appears.
Keep brief/post compatibility and leave the parent exception open.

## Done when

The existing form offers case-owned saved versions, the server accepts only
appropriate scoped versions for new questions, and focused service/UI checks
cover the added binding. Reuse the passing T52 native answer journey; no new
inbox, producer resume policy, paid call or duplicate end-to-end suite.

Evidence: `0f3a9725e` (pushed); existing service/UI suites pass 15 checks,
including exact binding after version advance. The canonical headed journey
passed in 5.5 minutes on 2026-09-19 with the real saved-post picker, exact-version
client answer and still-open exception; cleanup completed, no paid calls or
database reset. Strategy/ToV/plan eligibility is covered by the focused checks,
not separately claimed as a browser journey.
