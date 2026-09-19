---
id: AC4
story: F38-2
status: implemented
blocking: false
needs_decision: true
needs_trial: true
needs_code: false
---

# AC4

## Criterion

Wewnętrzne materiały pracy zachowują swój charakter; do pakietu są wyodrębniane wyniki przeznaczone dla klienta.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/packaging.ts` — Client view extracts takeaways instead of exposing full internal research payloads.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
