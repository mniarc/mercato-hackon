---
id: AC3
story: F05-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Wynikiem kroku jest gotowość do 3.1; w 2.3 nie są pobierane źródła ani wykonywane analizy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/paidCaseAnalysis/bootstrap.ts` — The configured analysis workflow is created for the same paid case inside the short transaction and is dispatched only after commit; replay reuses that workflow.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Native TC002 reached paid-case analysis and initial source processing before the later 3.4 fixture mismatch; no claim is made for the blocked remainder.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | passed |
| Native App | passed |
| Live Model | not_run |
