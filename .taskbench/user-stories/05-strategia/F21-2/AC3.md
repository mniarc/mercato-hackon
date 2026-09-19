---
id: AC3
story: F21-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Poprzednia wersja i jej akceptacja pozostają w historii, a nowa wersja przechodzi QA oraz właściwą akceptację.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategy.ts` — Immutable draft versions and QA loops preserve earlier versions.

## Missing

- Fresh QA/reapproval after an actual client revision has no connected coordinator path.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
