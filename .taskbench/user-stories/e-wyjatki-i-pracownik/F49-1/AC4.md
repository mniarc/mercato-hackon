---
id: AC4
story: F49-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Decyzja nie dopisuje produktu do zamówienia i nie omija wymaganej akceptacji klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Only keep_blocked is connected; no product addition, client approval override or publication authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
