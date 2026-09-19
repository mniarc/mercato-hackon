# Voice profile

A voice profile is a client's tone-of-voice document supplied to deslop with `--voice <path>`. Deslop's own rules are a generic hygiene layer; the profile is the client's layer on top. This file says how each profile field changes deslop's behaviour, what wins when they disagree, and what to do when the profile is partial.

Supported inputs:
- A full `KLI-TOV` document (JSON with `data.voice_principles`, `data.style_axes`, `data.wording`, `data.evidence_language`, `data.before_after`, `data.context_rules`, `data.copy_checks`, plus envelope fields `status`, `version`, `approval_records`).
- A `voice_extract` object from `WEW-ZLECENIE-POSTU` (up to 5 rules, banned clichés, one sentence pattern, a reference to the TOV version).
- Any free-text tone-of-voice guide. Map what you can onto the fields below; treat the rest as `author_behavior`.

## Contents

1. Load and gate
2. Precedence
3. Field by field
4. Partial profiles
5. Reporting

---

## 1. Load and gate

Read the whole profile before writing or auditing. Then check the envelope:

- `status` must be an accepted state (accepted, approved, or the process's equivalent). `simulated_draft`, `draft`, or an empty `approval_records` means the client has not approved this voice. In write mode, look for authorisation in the brief or instruction that invoked deslop (for instance a completion rule saying "this post is a draft in simulation; leave approval records empty"). If the instruction authorises a draft, write it and label the output as a draft under an unapproved profile. If nothing authorises it, stop and say so. The authorisation lives in the instruction, not in the profile. In detect mode, proceed but name the status in the report.
- Record `document_id` and `version`. Every output names the profile version it was written against.
- If the profile references a newer version than the one supplied, use the one supplied and flag the mismatch.

## 2. Precedence

The profile wins on everything that is a stylistic choice. Deslop wins only where the profile is silent, and on one rule that no profile can relax:

**Rule 4 (never invent) always holds.** No profile can permit fabricated facts, numbers, quotes, examples presented as real, or a claim stated more strongly than its evidence supports. A profile's `evidence_language` typically restates this; when it does, follow the profile's wording for how to mark hypotheses, examples, and limitations.

Concrete consequences:

- A structure the generic catalogue flags (a self-answered question, a metaphor, a rule-of-three list, a rhetorical opener) is allowed when the profile's `sentence_pattern`, `style_axes`, or `before_after` shows the client using it deliberately. Flag only its overuse, using the profile's own limits ("not every post has to follow question + checklist + contact").
- A word on deslop's generic watch list is fine when the profile's `preferred_in_context` or `expert_terms` names it.
- A word the profile bans is banned even if deslop's list would let it through.
- Where the profile sets a position on humour, directness, or claim strength, that position replaces deslop's default budgets.
- Where the profile is silent on a channel, `channels.md` applies.

## 3. Field by field

### voice_principles

Each principle carries a `trait`, a `purpose`, an `author_behavior`, and a `typical_error`.

- `author_behavior` is an instruction for write mode. Follow it literally: if it says "open with a concrete situation, tension, or a decision question", the first sentence does that.
- `typical_error` is a detect-mode pattern specific to this client. Add it to the findings catalogue for the session with the same treatment as generic patterns: quote the line, name the error as the profile names it, give the fix.
- `purpose` explains why the trait exists. Use it to resolve edge cases; do not quote it in output.

### style_axes

Each axis has a `position`, an `example`, and a `change_when`.

- `position` sets the default for that axis and replaces deslop's generic default (which is "direct, slightly informal"). Anchor to the `example`: the output should sound like the example does.
- `change_when` is a situational override. Detect the situation from the brief or the draft (an objection, contract terms, a specialist audience) and apply the override for that passage only.
- Do not invent a numeric scale. The axis is defined by its example, not by a 7/10.

### wording

- `preferred_in_context`: use these words in the described contexts; they override deslop's generic list.
- `replacements`: apply each `avoid → use` pair. This list has priority over `words.md`. The `replacement_boundary` says when not to apply a pair (usually: when the swap would change meaning, or when the term is part of a named method). Respect it.
- `cliches`: banned outright. When the profile says "remove without replacing with another promise", remove the clause and do not fill the gap with a softer promise.
- `expert_terms`: these are allowed jargon. The rule is not "cut it" but "explain it at first use if the audience needs it". The generic rule against unexplained acronyms yields to this list.
- `sentence_pattern`: a sanctioned structure. It may be used; it must not be the only structure in the piece. Placeholders in brackets are a pattern, not text to copy.

### evidence_language

Each entry maps a claim type (observed fact, own declaration, hypothesis, illustrative example, limitation) to a `pattern` and a `forbidden_upgrade`.

- Before writing a sentence that makes a claim, classify the claim by type and use the matching pattern.
- `forbidden_upgrade` lines are detect-mode patterns. "A visible contact does not prove effective support" means: flag any sentence that turns an observed fact into a quality claim.
- This field is the profile's version of deslop rule 4. When the profile and deslop describe the same prohibition in different words, use the profile's words in the report.

### before_after

Pairs of a discouraged version, a recommended version, the principle that changed, and the fact ids.

- Load these as the session's primary examples, ahead of `examples.md`. They show the client's voice on the client's own facts.
- The `after` versions define the register. When unsure how a sentence should sound, find the closest pair.
- Never treat the `before` text as banned content; it is the same facts in a weaker form.
- Examples are patterns of sound, not a source of facts. A fact that appears in a `before_after` pair but not in the brief's evidence payload is still out of bounds for the piece. When the brief lists permitted claims, that list is the whitelist and the profile's examples never extend it.

### context_rules

Each rule names a `situation`, a `tone_and_example`, and a `boundary`.

- These override `channels.md` for the named situations (explaining the method, inviting contact, answering scepticism, admitting missing data).
- `boundary` is a hard limit for that situation. "No freebie, no response deadline, no promise of a diagnosis" means the contact invitation contains none of those even if the brief's CTA field would otherwise allow them.

### copy_checks

Six to eight yes/no questions the client's editor can verify on the text.

- Append them to `checklist.md` as a client block. They run after the generic checklist, and their result is reported one by one.
- In write mode, a failing check is fixed before delivery; the fix is described in the report.
- In detect mode, each failing check is a finding with the quoted line.
- A passing structural validation does not mean the checks pass. Read the text.

## 4. Partial profiles

A `voice_extract` has at most: a handful of rules (usually from `voice_principles` and `style_axes`), the banned clichés, one sentence pattern, and the TOV reference.

- Apply what is present with the same precedence.
- Where a field is missing (typically `evidence_language`, `before_after`, `context_rules`, `copy_checks`), fall back to deslop's generic rule for that area and say so in the report: "Profile supplied as extract; evidence language and copy checks taken from deslop defaults."
- Do not reconstruct missing fields by guessing the client's voice from the extract. Ask for the full profile or proceed with the fallback, visibly.

## 5. Reporting

Every output written or audited under a profile ends with a short block that names:

- the profile document id and version, and its approval status;
- which fields were present (full profile / extract / free text);
- the `copy_checks` results, one line each, pass or fail with the fix applied;
- any `typical_error` or `forbidden_upgrade` patterns found;
- any place where the generic rule and the profile disagreed and which one was applied.

When the consumer of the output is a structured document (for instance a post record with a `qa` object and a `claims_map`), fill those fields from this block rather than appending prose. The block is the source; the format follows the consumer.
