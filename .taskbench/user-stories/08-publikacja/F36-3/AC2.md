---
id: AC2
story: F36-3
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Unieważniona rezerwacja nie jest wykonana, także gdy wcześniej przeszła kontrolę 8.4.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No reservation invalidation or send-start transition exists.

## Missing

- Ensure revoked reservation cannot execute.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
