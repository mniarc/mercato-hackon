---
id: AC1
story: F42-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Wiadomość zawierająca zgodę i żądanie zmiany nie zostaje zapisana jako bezwarunkowa akceptacja poprawianej treści.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Mixed approve/change is rejected as a single approval disposition.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
