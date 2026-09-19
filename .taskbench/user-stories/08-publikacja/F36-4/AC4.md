---
id: AC4
story: F36-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Historia pokazuje związek zgłoszenia, cofnięcia zgody, rezerwacji i stanu wysyłki, umożliwiając ustalenie kolejności.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No real consent/reservation/attempt chain is recorded.

## Missing

- Persist ordered source-request/consent/reservation/send events.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
