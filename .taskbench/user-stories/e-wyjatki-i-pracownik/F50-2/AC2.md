---
id: AC2
story: F50-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Sprawa pokazuje niespełniony warunek i rzeczywisty stan zadania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — T61/T62 expose exact blocked reason and inspection action; native exception evidence is visible.

## Missing

- Post-resolution gate result is unavailable while controlled resume is absent.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
