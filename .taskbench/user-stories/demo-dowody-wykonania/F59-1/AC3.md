---
id: AC3
story: F59-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Przełączenie prezentacji nie oznacza zadania jako sukces i nie dopisuje nieodbytej publikacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/lib/processProjection/query.ts` — Reading existing process state has no success/publication write.

## Missing

- No implemented presentation switch to verify separately.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
