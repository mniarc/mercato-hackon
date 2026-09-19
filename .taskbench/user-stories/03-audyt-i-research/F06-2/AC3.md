---
id: AC3
story: F06-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

WEW-ZRODLA jest utworzony według WZR-ZRODLA i powiązany z zamówieniem.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/sources.ts` — Source pipeline persists WZR-ZRODLA with order and exact input versions.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Native TC002 persisted and asserted the case-bound private source in initial research before the later 3.4 fixture mismatch.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
