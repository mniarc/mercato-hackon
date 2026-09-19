---
id: AC1
story: F36-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Kontrola obejmuje aktualność wersji i zgody, dokładny cel, gotowość integracji, wymagania kanału, otwarte zmiany i wstrzymania.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Pure evaluatePreflight has version/consent/destination/access/format/hold/prior-attempt gates.

## Missing

- Bind it to authoritative live configuration, consent and execution ledger before real send.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
