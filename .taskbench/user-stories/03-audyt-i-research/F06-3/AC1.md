---
id: AC1
story: F06-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Niedostępna strona lub profil pozostają w rejestrze z ograniczeniem dostępu; system nie zapisuje ich treści jako pobranej.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/fetch.ts` — Unavailable fetch keeps access limitation and null content rather than fabricated page text.
- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/__tests__/materialSources.test.ts` — Missing native extraction is retained as unavailable with null text and zero bytes; raw bytes or metadata are not presented as fetched content.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
