---
id: AC4
story: F24-2
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC4

## Criterion

Akceptacja nieaktualnej wersji lub odpowiedź z żądaniem zmiany nie otwiera bramki; wyjaśnienie albo poprawa wracają właściwą ścieżką przez G.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyPairAcceptance/accept.ts` — Currentness and trusted G binding reject stale/mixed approval.

## Missing

- Rejected changes need the missing actual correction/clarification return path, not just blocked acceptance.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
