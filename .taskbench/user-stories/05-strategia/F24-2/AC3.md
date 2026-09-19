---
id: AC3
story: F24-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Częściowa akceptacja jednego dokumentu pozostaje w historii, lecz nie uruchamia planowania bez gotowej zaakceptowanej pary.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyPairAcceptance/read.ts` — Cumulative partial records remain; planning waits until both documents accepted.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
