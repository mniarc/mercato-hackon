---
id: AC3
story: F06-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Polecenie umieszczone w pobranej stronie lub materiale jest traktowane jako treść źródłowa i nie zmienia zakresu ani instrukcji procesu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/gate.ts` — Native prompts treat external text as data; quote gate rejects instruction-looking evidence.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
