---
id: AC3
story: F47-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

System nie zakłada możliwości usunięcia lub edycji zewnętrznej wiadomości, jeśli używany adapter nie obsługuje takiej operacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Adapter capability catalog records unsupported/unknown capabilities.

## Missing

- No live published-content repair adapter or capability-gated execution.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
