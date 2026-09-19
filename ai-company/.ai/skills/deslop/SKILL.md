---
name: deslop
description: Write, edit, or audit prose so it reads like a specific person wrote it, not a language model. Three modes - write from scratch, edit an existing draft while preserving the writer's voice, or detect and list AI-writing patterns without rewriting. Use this whenever the user asks to write, draft, rewrite, polish, "make it sound human", "make it less AI", "de-slop", audit a text, or asks "does this read as AI?" - for emails, Slack messages, posts, articles, docs, READMEs, cover letters, specs, in English or Polish. Also use it silently on any prose the user will publish or send under their own name, even when they don't mention slop.
---

# Deslop

Turn generic model-shaped prose into writing that belongs to one person, one subject, one reader. The job is subtraction and precision, not decoration. A cleaned draft should have fewer words, more facts, and the same author.

## Arguments

- `--voice <path>` (optional): a client voice profile. Accepts a full tone-of-voice document (KLI-TOV JSON), a `voice_extract` object, or a free-text guide. When present, read `references/voice-profile.md` before doing anything else; it says how the profile changes every rule below and what wins when they disagree. Without a profile, deslop uses its own defaults.
- `--output <format>` (optional): `text` (default) returns prose plus a *What changed* section; `record` returns the structured fields a downstream document expects (see Agent output). 
- Mode is inferred from the request or set explicitly: `--mode write|edit|detect`.

## Three modes

Pick the mode from the request. When unclear, ask one question.

**Write.** No draft exists. Establish who is writing, to whom, on what channel, and what the reader should do afterwards. If any of that is missing and it changes the output, ask once. Then write directly under the constraints in this file. Do not mention the rules.

**Edit (default when a draft is provided).** Make the minimum change that removes the patterns and clarifies the meaning. Return the full edited text, then a short *What changed* section: which patterns were removed, what was reorganised and why, and any facts you were unsure about. The writer should recognise the result as their own.

**Detect.** The user asks whether a text is slop, or wants it audited without changes. Return a list: for each pattern found, quote the line, name the pattern, give the fix in under ten words. Do not rewrite, do not score, and do not claim to know who or what wrote it. Named patterns are evidence the user can check; authorship guesses are not. Offer to edit afterwards.

## The four rules everything else follows from

**1. Specific beats general.** A sentence that could be lifted unchanged into a text about another company, product, person, or country is filler. Cut it or replace it with a fact, number, name, date, mechanism, consequence, or judgment that only fits this subject. Protect existing specifics: never smooth "cut deploy time from 40 minutes to 4" into "significantly faster".

**2. Show, don't announce.** Delete commentary that tells the reader something is important, surprising, subtle, or key. If the surrounding prose already makes the point, the label is redundant; if it doesn't, the label won't save it. The same goes for openers that announce a point is coming and closers that restate it.

**3. Name the actor.** Prefer active voice with a human subject. Decisions do not emerge, cultures do not shift, data does not tell us anything; a person decides, changes behaviour, reads the numbers. When no specific person fits, "you" puts the reader in the seat.

**4. Never invent to sound human.** No fabricated statistics, quotes, studies, anecdotes, or "last Tuesday" details that didn't happen. No deliberate typos or manufactured roughness. If a claim needs a source the user hasn't given, ask or mark it with a bracket like [source?]. Honest vagueness beats fake precision every time.

## Preserve the voice

Before editing, read the whole draft and note what is personal in it: vocabulary, sentence rhythm, bluntness, humour, admitted uncertainty, digressions, level of polish. Keep those. A rough draft with a real voice should still be rough in the same places after editing.

Concretely:
- Keep "I think", "maybe", "to be honest" when they express real uncertainty or the writer's spoken rhythm. Cut them when they hedge a claim the writer is sure about.
- Keep opinions, profanity, self-interruptions, and jokes that belong to the writer. Do not replace them with safer phrasing.
- Keep the writer's structure and detours unless they hurt the piece. If you reorganise, say so in *What changed*.
- Do not make every paragraph equally tidy. Uniform polish is itself a tell.

Budgets, not bans. Adverbs, em dashes, colons, rhetorical questions and short punchy sentences are all legitimate tools. They become slop through frequency and predictability. Rough guide for a piece of ordinary length: an em dash or two, an exclamation mark at most, a punchy one-liner at most once per section. In short copy (a Slack message, a tweet) use none.

## Patterns to remove

The full catalogue with fixes is in `references/patterns.md`; read it when editing anything longer than a few paragraphs. The ones that do the most damage:

- **Binary contrast.** "It's not X. It's Y." State Y.
- **Negative runway.** "Not a tool. Not a framework. A way of thinking." State the thing.
- **Throat-clearing opener.** "Here's the thing", "Let me be clear", "The truth is". Delete, start at the point.
- **Faux-insight setup.** "What nobody tells you", "The part everyone misses". Delete, let the claim stand alone.
- **Colon reveal.** "The best part: it learns." Write a plain sentence.
- **Trailing -ing gloss.** "...adding search, highlighting the team's commitment to quality." Cut the gloss or replace it with the concrete consequence.
- **Importance puffery.** "Marks a pivotal moment", "a testament to". State the fact, let the reader judge.
- **Weasel attribution.** "Experts agree", "studies show". Name the source or cut the claim.
- **Synonym cycling.** Rotating "the agent / the assistant / the tool" for variety. Repeat the clear word.
- **Fake-profound kicker.** A closing aphorism or mic-drop line. Delete it, end on the last concrete sentence. Do not write a better aphorism.
- **Recap ending.** "In conclusion", "Ultimately", a last paragraph that restates the piece. Cut.
- **Hedging seesaw.** Every claim balanced by its opposite. Take a position; give counterpoints one sentence.
- **Credential opener.** "As a product manager with ten years' experience, I...". Say the thing.
- **Metronome rhythm.** Three sentences of the same length in a row, every paragraph shaped topic-explanation-example-transition, staccato fragments stacked for drama. Vary shape only where it helps meaning.
- **Rule of three by default.** Lists and triads that exist because three sounds complete. Use however many items the content has.

## Client voice profile

When `--voice` is set, the profile is the client's layer and deslop is the hygiene layer underneath. Precedence, in one line: the profile wins on every stylistic choice; deslop wins only where the profile is silent, and rule 4 (never invent) holds under any profile. A structure the catalogue below would flag is allowed when the profile shows the client using it on purpose; a word the profile bans is banned even if `words.md` would pass it.

Before writing under a profile, check its approval status. An unapproved voice (draft, simulated, no approval records) blocks write mode unless the brief or instruction that invoked deslop authorises a draft; the draft is then labelled as such. Every output names the profile version it was written against. When the brief lists permitted claims, that list is the whitelist for facts; the profile's examples show how the client sounds and never add facts to the piece.

Field mapping, partial profiles, and the report block are in `references/voice-profile.md`.

## Words to watch

`references/words.md` has the English and Polish lists. Treat them as smell detectors, not a blacklist: a banned word inside a quote, a product name, or a deliberate joke stays. A banned word doing generic work goes.

## Format follows the channel

Read `references/channels.md` before writing or editing for a specific medium. Short version: no markdown in email, chat, or DMs; no headers over two-sentence sections; no bold sprinkled mid-sentence for emphasis; no emoji bullets; bullet lists only when the content is a list. Markdown is fine in docs and READMEs where it will render.

## Agent output (`--output record`)

When deslop runs inside an agent that produces a structured post record, it returns fields rather than prose commentary:

- `text`: the full piece, nothing else in it.
- `claims_map`: one entry per sentence that asserts something about the client, the world, or a result. Each entry has the fragment, the fact or seed id it rests on, its kind (`fact`, `hypothesis`, `creative_example`, `own_declaration`, `limitation`), and whether the wording stays within what the evidence supports. A sentence with no supporting id is either removed from `text` or listed with `unsupported: true` for the editor to decide. Questions and metaphors are listed only when they imply a result.
- `qa`: the generic checklist result in one line, then the profile's `copy_checks` one by one (pass / fail + fix applied), then the profile id, version and status, then any place where the generic rule and the profile disagreed and which one was applied.
- `client_note` (when asked): up to 80 words, why this angle serves the brief and what the client should check. No strategy recap.

The author's `qa` is a proposal. An independent editor runs deslop in detect mode with the same profile before anything reaches the client; the author does not mark the piece ready.

## Workflow

1. If `--voice` is set, read `references/voice-profile.md`, load the profile, check its status and version.
2. Read the whole input. Identify the core point and the audience. If you cannot state the core point in one sentence, ask the user for it.
3. Detect mode: produce the findings list (generic patterns, then the profile's `typical_error` and `forbidden_upgrade` patterns, then failing `copy_checks`) and stop.
4. Edit or write mode: draft under the rules above, with the profile's `before_after` as the primary examples when present.
5. Run `references/checklist.md`, then the profile's `copy_checks`. Fix any failure and re-run.
6. Deliver in the requested output format. Never narrate the rules, never say "as per the guidelines".

Before/after examples are in `references/examples.md`; consult them when a pattern is hard to recognise or the right fix is unclear.
