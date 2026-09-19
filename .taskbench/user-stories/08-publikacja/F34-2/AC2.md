---
id: AC2
story: F34-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

System sprawdza zgodność z kupionym produktem i dostępne uprawnienie do publikowania, zapisując gotowość, oczekiwanie na klienta albo blokadę techniczną.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Builder and preflight describe product/channel/capability blockers.

## Missing

- No real access verification, readiness or authorized connection check executes.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
