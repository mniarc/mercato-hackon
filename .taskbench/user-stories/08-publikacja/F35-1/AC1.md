---
id: AC1
story: F35-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

System porównuje wersję KLI-POST i dokładny cel z istniejącą zgodą oraz zapisuje osobę, czas i źródło decyzji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Consent always missing; no stored exact-target decision reader.

## Missing

- Implement exact-version/target consent with actor/time/source.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
