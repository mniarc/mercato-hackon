---
id: AC2
story: F01-2
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Pytanie i odpowiedź są widoczne przy kontakcie i produkcie; zakup nie jest wymagany do zadania pytania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/sales-advisor/definition.ts` — No connected pre-purchase sales-question storage/delivery path found.

## Missing

- Persist question/answer at contact and product without requiring purchase.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
