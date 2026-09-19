---
id: AC4
story: F38-4
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Do skutecznego technicznego przekazania pakietu krok 9.3 pozostaje zablokowany; brak odczytu po skutecznym przekazaniu nie jest traktowany jako błąd dostawy.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/closure.ts` — Gate blocks when delivery evidence missing, independent of read status.

## Missing

- Wire actual delivery failure/success lifecycle to native close step.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
