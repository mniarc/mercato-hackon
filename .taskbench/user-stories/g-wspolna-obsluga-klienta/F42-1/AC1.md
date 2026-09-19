---
id: AC1
story: F42-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Triaż rozpoznaje pytanie, materiał, zmianę, akceptację, problem albo wstrzymanie i zapisuje uzasadnienie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/contract.ts` — Typed worker interpretation preserves intent, rationale and proposed disposition; execution authority remains server-derived.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | unknown |
| Live Model | not_run |
