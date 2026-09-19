---
id: AC2
story: F10-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Odpowiedź o odbiorcach trafia do G, które ustala wpływ na brief i zależne dokumenty.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Exact saved brief response enters G and new revision route.

## Missing

- General downstream impact/invalidation from changed audience remains beyond bounded invited-answer revision.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
