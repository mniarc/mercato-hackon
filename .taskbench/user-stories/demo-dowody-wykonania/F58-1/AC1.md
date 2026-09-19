---
id: AC1
story: F58-1
status: missing
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Publikacja używa zgody klienta na wskazaną wersję i miejsce Discord; wcześniejsza nadal ważna zgoda nie wymaga powtórzenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/publication.ts` — Publication currently stops at documents/preflight without a provider send.

## Missing

- No Discord-bound client consent consumed by real publication.

## Decision Required

- T31: confirm publication policy, actual provider/target and exact-version destination-bound client consent; no external send authority assumed.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | not_run |
