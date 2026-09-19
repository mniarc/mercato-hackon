---
id: AC3
story: F35-1
status: implemented
blocking: false
needs_decision: true
needs_trial: true
needs_code: false
---

# AC3

## Criterion

Brak odpowiedzi, akceptacja samego tekstu, zgoda na inną wersję lub inne miejsce zatrzymują wysyłkę.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Consent missing makes preflight fail independently of valid content approval.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
