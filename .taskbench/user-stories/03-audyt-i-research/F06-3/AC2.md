---
id: AC2
story: F06-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Gdy przypisanie adresu lub profilu jest wątpliwe, prośba o wyjaśnienie trafia przez G do klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/fetch.ts` — Collector marks access limitations but no scoped G clarification route for uncertain website/profile ownership found.

## Missing

- Ask client through G and bind clarification to original source task.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
