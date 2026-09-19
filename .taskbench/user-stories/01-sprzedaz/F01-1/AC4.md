---
id: AC4
story: F01-1
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Wybór produktu zapisuje wybrany produkt i wersję; samo oglądanie, wybór lub rezygnacja nie uruchamiają analizy ani realizacji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency/frontend/[orgSlug]/portal/agency/page.tsx` — Order request pins offer version; source workflow starts only after verified test capture. Watching or selecting offer has no analysis call.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | not_run |
| Live Model | not_run |
