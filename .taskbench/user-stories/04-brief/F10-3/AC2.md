---
id: AC2
story: F10-3
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Dyspozycja aktualizacji prowadzi do 4.1, sprawdzenia dowodów do 4.5, ważnej akceptacji do 4.6, a pytania do klienta do 4.3.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/briefRevision/binding.ts` — Acceptance, clarification and scoped answer-revision routes exist.

## Missing

- Implement evidence-check4.5 and general directed correction beyond invited answers.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
