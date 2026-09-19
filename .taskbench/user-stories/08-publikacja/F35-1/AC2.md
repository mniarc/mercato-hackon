---
id: AC2
story: F35-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

Ważna wcześniej zarejestrowana zgoda jest wykorzystana bez ponownego pytania i otwiera 8.4 przy gotowej integracji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No valid consent can be returned by current consent reader.

## Missing

- Reuse persisted valid consent and verified integration to permit preflight.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
