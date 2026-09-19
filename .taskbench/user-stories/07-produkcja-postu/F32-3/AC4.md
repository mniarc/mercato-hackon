---
id: AC4
story: F32-3
status: missing
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Ważna zgoda może zostać wykorzystana w 8.3 bez ponownego pytania; zmiana wersji lub celu wymaga właściwej nowej zgody.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No valid consent reader or target/version renewal flow exists.

## Missing

- Reuse exact valid consent and invalidate/renew when content or target changes.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
