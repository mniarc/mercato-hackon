---
id: AC2
story: F34-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC2

## Criterion

W OM widoczne są wykonawcy, zależności i limity użyte dla danego etapu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/publicationConfig.ts` — Task runs preserve input versions and blockers.

## Missing

- Real publication performers, integration tasks and versioned limits are not activated.

## Decision Required

- Approve proposed publication scope/provider and authorize external sends before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
