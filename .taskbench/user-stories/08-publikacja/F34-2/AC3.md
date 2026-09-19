---
id: AC3
story: F34-2
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC3

## Criterion

Brak danych powoduje wysłanie konkretnego pytania i oczekiwanie; dopiero odpowiedź klienta trafia do G.1 i wraca do 8.2 jako O-G.5.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — Builder returns blockers and next-action text only.

## Missing

- Send native scoped customer question and consume its G response back into config.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
