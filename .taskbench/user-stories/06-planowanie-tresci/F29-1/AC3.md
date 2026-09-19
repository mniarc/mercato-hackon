---
id: AC3
story: F29-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Wewnętrzna kontrola potwierdza zgodność instrukcji z wybranym tematem i dokumentami; nie dopisuje nowych założeń.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/postInstruction.ts` — Compilation validates source references and selected topic, returning issue codes instead of inventing inputs.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
