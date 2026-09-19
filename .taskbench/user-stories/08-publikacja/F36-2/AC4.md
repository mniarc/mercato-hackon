---
id: AC4
story: F36-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Rejestr zachowuje historię prób i przyczyn blokad; rezerwacja sama w sobie nie jest dowodem wysyłki ani sukcesu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Document guard fields exist; default state is none with empty attempt_refs.

## Missing

- Persist actual attempt history and reservation outcomes, not declarative fields only.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
