---
id: AC3
story: F48-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Blokowane jest tylko wykonanie zależne od nierozwiązanego wyjątku.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/researchException/workflow.ts` — Scoped workflow exception pauses dependent case production; independent cases are not globally blocked.

## Missing

- No full cross-document impact scheduler demonstrates selective independent branches.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | passed |
| Live Model | not_run |
