---
id: AC4
story: F26-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Wartość 12 jest oznaczona jako założenie robocze wymagające ustalenia w katalogu przed implementacją.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/data/schemas/zamowienie.ts` — Native planning rejects missing count, but generic orderFactsOf still defaults topics to 12.

## Missing

- Remove/qualify remaining unconditional 12-topic fallback and client package label; production catalog count needs settlement.

## Decision Required

- Settle production offer topic count; authorized demo configuration is separate.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
