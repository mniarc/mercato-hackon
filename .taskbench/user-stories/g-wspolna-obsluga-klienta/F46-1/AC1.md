---
id: AC1
story: F46-1
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Nowa uwaga do postu w G.1 wstrzymuje oczekującą publikację do oceny zgłoszenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Publication module explicitly stops before reservation and send.

## Missing

- A new post comment cannot revoke/hold a real pending publication attempt.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
