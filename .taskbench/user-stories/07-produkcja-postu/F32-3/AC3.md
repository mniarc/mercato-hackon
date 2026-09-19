---
id: AC3
story: F32-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Brak celu, ogólna akceptacja tekstu lub zgoda na inne miejsce pozostawiają zgodę publikacyjną jako brakującą.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Missing target or generic text approval never becomes valid publication consent.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the authenticated client reviewed the exact QA-passed post, saw that content approval did not authorize publication, explicitly accepted that version, and the saved result retained valid content approval with publication consent missing.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
