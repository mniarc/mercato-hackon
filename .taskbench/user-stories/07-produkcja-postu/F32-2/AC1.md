---
id: AC1
story: F32-2
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC1

## Criterion

Po dyspozycji 7.5 system łączy aktualną wersję postu i jej pozytywne QA z decyzją uprawnionej osoby, czasem oraz źródłem zgłoszenia.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/postAcceptance/accept.ts` — Public producer plus trusted G adapter persist current exact post/QA, actor, time and original source.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
