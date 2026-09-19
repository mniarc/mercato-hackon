---
id: AC4
story: F29-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Samo przekazanie nie generuje tekstu postu i nie dodaje nowej akceptacji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postInstructionExecution/run.ts` — Compiler itself deterministic, no post text generation or new client consent.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
