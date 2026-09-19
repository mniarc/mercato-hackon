---
id: AC3
story: F12-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Odpowiedź „akceptuję, ale zmień…” jest uwagą zgodnie z decyzją G, a nie zgodą na wersję.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/briefApproval.ts` — Mixed change+approval cannot satisfy coherent approval binding.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
