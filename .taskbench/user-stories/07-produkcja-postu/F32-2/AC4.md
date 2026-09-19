---
id: AC4
story: F32-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Akceptacja treści bez osobnej dyspozycji publikacji zapisuje wyłącznie akceptację treści.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postAcceptance/accept.ts` — Scope is post_content only; publication permission is not recorded by content acceptance.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the authenticated client reviewed the exact QA-passed post, saw that content approval did not authorize publication, explicitly accepted that version, and the saved result retained valid content approval with publication consent missing.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
