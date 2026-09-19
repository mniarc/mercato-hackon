---
id: AC1
story: F38-1
status: partial
blocking: true
needs_decision: true
needs_trial: true
needs_code: true
---

# AC1

## Criterion

Kontrola zestawia zakupione rezultaty z wnioskami audytu i konkurencji, briefem, strategią, TOV, planem, jednym postem i jedną wykonaną publikacją.

## Evidence

- `ai-company/apps/mercato/src/modules/agency_research/lib/research/steps/package.ts` — Package builder enumerates expected results and publication proof.

## Missing

- Wire scoped producer to real native delivery stage; current lane is document-only.

## Decision Required

- Approve proposed delivery/closure scope and choose the real sharing channel before activation.

## Verification

| Layer      | Status  |
|------------|---------|
| Focused    | unknown |
| Native App | unknown |
| Live Model | unknown |
