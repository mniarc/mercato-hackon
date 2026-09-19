---
id: AC1
story: F36-4
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Nowa uwaga lub wstrzymanie odebrane przez G przed startem adaptera blokują zależną publikację i unieważniają jeszcze niewysłaną rezerwację.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_operations/agents/client-triage/projectResult.ts` — Hold is currently unsupported as an applied G route.

## Missing

- Apply original client hold to dependent publication and invalidate unsent reservation.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
