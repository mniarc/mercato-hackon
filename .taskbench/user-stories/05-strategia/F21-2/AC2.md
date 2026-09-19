---
id: AC2
story: F21-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Treści nieobjęte poprawką pozostają zachowane; zmiana wynikająca z zależności ma wskazaną przyczynę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategy.ts` — Repair prompt receives previous content and targeted findings.

## Missing

- Client-directed preservation and necessary dependency-change reasons are not implemented end to end.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
