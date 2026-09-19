---
id: AC2
story: F37-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Pewne niepowodzenie pozwala na ponowienie tylko dla błędu kwalifikującego się do retry i w limitach STD-LIMITY.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Retry_allowed is always false; no executed rejection exists.

## Missing

- Implement bounded retry policy for provably not-sent retryable failures.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
