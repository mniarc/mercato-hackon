---
id: AC1
story: F32-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Klient otrzymuje pełny tekst konkretnej wersji po pozytywnym QA, a system zapisuje stan oczekiwania na decyzję.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/postReview/service.ts` — Exact current QA-approved post is rendered in native customer review task and waits for response.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the authenticated client reviewed the exact QA-passed post, saw that content approval did not authorize publication, explicitly accepted that version, and the saved result retained valid content approval with publication consent missing.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
