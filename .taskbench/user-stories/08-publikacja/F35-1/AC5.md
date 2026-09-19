---
id: AC5
story: F35-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Wstrzymanie lub zmiana przekazane przez G utrzymują odpowiednią blokadę; zgoda nie przenosi się automatycznie na zmieniony tekst lub cel.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No consent inheritance is fabricated.

## Missing

- Implement G hold/revocation and binding-specific invalidation of real consent.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
