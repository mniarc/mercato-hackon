---
id: AC3
story: F30-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Produkcja dotyczy jednego postu; zadania nie zwiększają liczby rezultatów pakietu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/readiness.ts` — Execution requires the instruction from the single selected topic and typed plan receipt; post schema one-result guard.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
