---
id: AC1
story: F12-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Zgoda dotycząca starej wersji nie nadaje akceptacji aktualnej wersji briefu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Current-version guard rejects old approval; historical idempotent receipt cannot approve a different version.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
