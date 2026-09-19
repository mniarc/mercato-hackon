---
id: AC2
story: F27-3
status: implemented
blocking: false
needs_decision: false
needs_trial: true
needs_code: false
---

# AC2

## Criterion

Rekord łączy osobę, czas i źródło decyzji z dokładną wersją KLI-PLAN oraz jednym ID tematu istniejącym w tej wersji.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/planAcceptance/accept.ts` — Scoped typed receipt includes actor/time/source, exact plan and topic present in that plan.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
