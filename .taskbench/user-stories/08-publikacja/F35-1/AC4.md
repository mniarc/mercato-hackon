---
id: AC4
story: F35-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Przy braku zgody agent wysyła prośbę o konkretną decyzję i oczekuje; wychodząca prośba nie jest WE-KLIENT, a odpowiedź przechodzi przez G.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — No outbound consent request task or reply bridge exists.

## Missing

- Create exact-target client request and route actual reply via G.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
