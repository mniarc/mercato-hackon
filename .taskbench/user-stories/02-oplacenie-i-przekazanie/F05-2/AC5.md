---
id: AC5
story: F05-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC5

## Criterion

Sprawa nie zawiera limitu rund poprawek klienta; techniczne limity dotyczą wykonania pojedynczych zadań.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/orderBootstrap/activate.ts` — Purchase/case model has no client revision-round counter; technical execution limits belong to configured research policy.
- `ai-company/apps/mercato/src/modules/agency_operations/lib/paidCaseAnalysis/contracts.ts` — The handoff carries explicit technical execution policy and result limits; it introduces no client revision-round counter.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | not_run |
| Live Model | not_run |
