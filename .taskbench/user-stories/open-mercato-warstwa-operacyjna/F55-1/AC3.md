---
id: AC3
story: F55-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Uprawnienie do akceptacji klienta i uprawnienie do rozstrzygnięcia E.2 są sprawdzane odrębnie.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Native employee task authority is separate from customer review authority.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
