---
id: AC5
story: F06-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Brak oficjalnego profilu nie powoduje dodania niezweryfikowanego profilu innej firmy jako źródła klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/fetch.ts` — Official social source comes from explicit order data; collector does not substitute guessed third-party profile.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
