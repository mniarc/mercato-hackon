---
id: AC1
story: F11-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Zadanie wynika z potrzeby sprawdzenia w 4.4 i wskazuje zagadnienie, źródło zgłoszenia oraz pole briefu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/binding.ts` — The saved native G directive binds the exact submission, event, customer, workflow, question and target brief field.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/materialRevision/__tests__/binding.test.ts` — Focused checks reject a directive whose persisted material input differs from the original saved source.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
