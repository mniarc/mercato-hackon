---
id: AC1
story: F34-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Zadania publikacji powstają zgodnie ze STD-PROCES i są powiązane z zamówieniem, instrukcją oraz zaakceptowaną wersją postu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — Document-only tasks 8.2/8.3/8.7 exist in teammate pipeline.

## Missing

- Native 8.1 activation from accepted 7.7 with configured task graph is missing.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
