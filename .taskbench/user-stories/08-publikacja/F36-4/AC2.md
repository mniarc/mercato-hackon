---
id: AC2
story: F36-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Atomowe rozpoczęcie 8.5 nie przechodzi, gdy blokada albo cofnięcie zgody obowiązywały przed tą zmianą stanu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No atomic sending transition exists.

## Missing

- Serialize hold/revocation against send-start.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
