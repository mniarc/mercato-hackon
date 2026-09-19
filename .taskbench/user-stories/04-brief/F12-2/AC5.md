---
id: AC5
story: F12-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Nowa treść nie dziedziczy zgody starej wersji, a historia wcześniejszej akceptacji pozostaje dostępna.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — New version has separate approval records; historical accepted version stays readable.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
