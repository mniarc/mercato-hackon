---
id: AC2
story: F12-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Brak odpowiedzi, samo otrzymanie materiału lub przesłanie załącznika nie są zapisywane jako akceptacja.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/briefAcceptance/accept.ts` — Only explicit original approval plus saved G disposition can call acceptance; attachment/receipt alone does not.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
