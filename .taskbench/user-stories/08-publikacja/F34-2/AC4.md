---
id: AC4
story: F34-2
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Discord hackathonu jest wariantem bazowym demo, a LinkedIn jest dostępny wyłącznie po ukończeniu integracji; system nie podmienia celu bez rozstrzygnięcia zakresu i zgody klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Adapter catalog descriptors do not imply a working send integration; no target substitution occurs.

## Missing

- Select/implement authorized demo provider; no completed LinkedIn integration is evidenced.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
