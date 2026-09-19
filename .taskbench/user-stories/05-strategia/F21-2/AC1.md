---
id: AC1
story: F21-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Agent korzysta z poprzedniej KLI-STRATEGIA oraz dyspozycji przekazanej przez 5.6 i zapisuje powiązanie nowej wersji z tą dyspozycją.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/strategy.ts` — Writer can accept previousStrategy/repairFindings for internal QA repair.

## Missing

- No saved client G 5.6 directive invokes scoped strategy revision with source binding.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
