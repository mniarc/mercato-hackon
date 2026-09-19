---
id: AC4
story: F32-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Akceptacja treści i dyspozycja publikacji są wyraźnie rozróżnione; brak wskazanego celu nie jest uzupełniany przez domysł agenta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Content approval is separate; publicationConsentCheck always missing rather than guessing target or permission.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the authenticated client reviewed the exact QA-passed post, saw that content approval did not authorize publication, explicitly accepted that version, and the saved result retained valid content approval with publication consent missing.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
