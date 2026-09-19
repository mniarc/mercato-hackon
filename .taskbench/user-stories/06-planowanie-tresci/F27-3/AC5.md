---
id: AC5
story: F27-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Nowa wersja planu nie dziedziczy zgody; akceptacja starej wersji pozostaje w historii.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planAcceptance/accept.ts` — New versions have separate approval records; old receipt replay cannot approve a different version.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
