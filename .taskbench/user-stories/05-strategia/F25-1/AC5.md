---
id: AC5
story: F25-1
status: partial
blocking: true
needs_decision: false
needs_trial: true
needs_code: true
---

# AC5

## Criterion

Akceptacje starych wersji są zachowane historycznie, ale nie zdejmują blokady materiałów wymagających przeglądu.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/strategyPairAcceptance/read.ts` — Historical acceptance records survive and stale foundation gate blocks continuation.

## Missing

- No full invalidation/review propagation after applying a client direction change.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
