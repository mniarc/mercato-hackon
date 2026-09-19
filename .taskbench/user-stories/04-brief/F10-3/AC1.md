---
id: AC1
story: F10-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Wejściem jest zakwalifikowana odpowiedź O-G.5 powiązana z aktualnym briefem i WEW-ZMIANY.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Binds persisted source submission, native G result, active customer and exact brief invitation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
