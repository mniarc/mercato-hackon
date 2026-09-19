---
id: AC5
story: F41-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Nowa wersja treści wymaga właściwej nowej akceptacji, a wcześniejsza zgoda pozostaje w historii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Version-specific approval records remain on historical versions; currentness gates reject old acceptance for new content.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
