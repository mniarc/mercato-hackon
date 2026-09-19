---
id: AC4
story: F34-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Aktywacja prowadzi do sprawdzenia celu i dostępu 8.2; nie oznacza jeszcze gotowości do wysyłki.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — Configuration builder honestly reports missing destination/access.

## Missing

- Connected 8.1→8.2 native activation/access validation is missing.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
