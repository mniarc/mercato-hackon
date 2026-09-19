---
id: AC2
story: F30-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Autor i recenzent są widoczni w OM-02, a zadania wskazują dokładną wersję instrukcji i wejść.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/run.ts` — Activation and worker tasks persist author/editor agent IDs, instruction and input versions for ledger display.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
