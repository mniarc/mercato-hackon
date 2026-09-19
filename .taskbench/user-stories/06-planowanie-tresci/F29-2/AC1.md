---
id: AC1
story: F29-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Przekazanie wskazuje gotową WEW-ZLECENIE-POSTU, aktualną akceptację planu i wybrany temat.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postExecution/readiness.ts` — Post readiness binds exact ready instruction, plan acceptance and selected topic.
- `ai-company/apps/mercato/src/modules/agency_operations/__integration__/TC-AGENCY-002-brief-to-plan.spec.ts` — Headed TC002 passed 2026-09-19 at ef3b5390d: the saved post instruction was ready and retained the exact approved plan version, selected offered topic TOP02, and selection submission ID before production.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | unknown |
