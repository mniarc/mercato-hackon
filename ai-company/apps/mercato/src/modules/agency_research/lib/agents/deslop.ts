/**
 * The `deslop` skill (`.ai/skills/deslop`, v0.3) folded into agent instructions.
 * The agents are tool-less, so the skill's SKILL.md and references cannot be read
 * at run time; the parts that change what a writer or an editor does are
 * repeated here in the same condensed form. Precedence is the skill's: the
 * client's ToV wins every stylistic choice, deslop wins where the ToV is silent,
 * and rule 4 (never invent) holds under any profile. Word lists for the
 * deterministic validator live in `lib/research/deslop.ts`.
 */

export const DESLOP_VERSION = '0.3'

/** The four rules every client-facing writer follows (brief, strategy, ToV, plan, post). */
export const DESLOP_PROSE_RULES = [
  'Prose hygiene (deslop): (1) specific beats general — a sentence that could be lifted',
  'unchanged into a text about another company is filler; replace it with a fact, name,',
  'mechanism or consequence from the input, or cut it; never smooth an existing specific',
  'into a vaguer one. (2) Show, do not announce — no "this is crucial", "warto podkreślić",',
  'no opener that promises a point and no closer that restates it. (3) Name the actor —',
  'a person decides, reads, changes; data does not "tell", a culture does not "shift".',
  '(4) Never invent to sound human — no statistic, quote, study, anecdote, "last Tuesday"',
  'detail, customer or result that is not in the input; when a claim would need support',
  'the input does not give, narrow it or drop it, never add a number or an example. No',
  'manufactured roughness (deliberate typos, fake hesitation). Rhythm and punctuation are',
  'budgets, not bans: vary sentence length, no three same-length sentences in a row, no',
  'lists of three by habit, an em dash or two per piece, one exclamation mark at most.',
].join(' ')

/** The catalogue entries that do the most damage, with their fix, for the author and the editor. */
export const DESLOP_PATTERNS = [
  'Patterns to avoid (each with its fix): binary contrast "It\'s not X. It\'s Y." / "Nie chodzi',
  'o X, chodzi o Y" → state Y; negative runway "Not a tool. Not a framework. A way of',
  'thinking." → state the thing; throat-clearing opener ("Here\'s the thing", "Let me be',
  'clear", "Prawda jest taka") → delete, start at the point; faux-insight setup ("What nobody',
  'tells you", "Większość firm robi to źle") → delete; rhetorical priming ("Imagine…", "Ever',
  'wondered…", "Wyobraź sobie…") → answer as a statement; colon reveal ("The best part: it',
  'learns.") → plain sentence; self-answered question ("Why? Because…") → keep the because;',
  'importance label ("Importantly", "Co istotne", "Warto zauważyć") → delete; trailing -ing',
  'gloss ("…, highlighting the team\'s commitment", "…, co podkreśla zaangażowanie") → cut or',
  'write the concrete consequence; importance puffery ("a testament to", "pivotal",',
  '"przełomowy", "stanowi świadectwo") → state what happened; weasel attribution ("experts',
  'agree", "badania pokazują") → name the source or cut; lazy extremes ("everyone", "always",',
  '"nikt", "zawsze") → the actual case; false agency ("the decision emerged", "rynek nagradza")',
  '→ name who did it; fake-strong verbs ("serves as a hub for", "stanowi") → "is"/"has" plus',
  'the function; synonym cycling (the agent / the assistant / the tool) → repeat the clear',
  'word; staccato drama ("Speed. Quality. Cost.") → one sentence; fake-profound kicker (a',
  'closing aphorism, "Przyszłość już tu jest") → end on the last concrete sentence, do not',
  'write a better aphorism; recap ending ("In conclusion", "Podsumowując") → cut; hedging',
  'seesaw → take a position; credential opener ("As a CTO with ten years…", "Jako…") → say',
  'the thing; response-shaped connectors (Moreover, Furthermore, Ponadto, Co więcej,',
  'Dodatkowo, Firstly/Po pierwsze as a skeleton) → cut. Not slop, do not "fix": a short',
  'sentence after a long one used once, a question the text goes on to explore, "I think" /',
  '"chyba" when the writer is unsure, a list when the content is a list, three items when',
  'there are three, a repeated key term, passive when the actor is unknown, the client\'s own',
  'humour or bluntness.',
].join(' ')

/** Words that smell of a model (detectors, not bans): a word inside a quote, a product name or a deliberate joke stays. */
export const DESLOP_WORDS = [
  'Words to watch, EN: delve, tapestry, landscape, realm, beacon, testament, pivotal,',
  'crucial, paramount, vital, intricate, multifaceted, nuanced, meticulous, robust, seamless,',
  'holistic, comprehensive, groundbreaking, cutting-edge, transformative, revolutionary,',
  'unprecedented, remarkable, vibrant, dynamic, innovative, powerful, world-class,',
  'best-in-class; leverage, utilize, facilitate, foster, empower, harness, unlock,',
  'streamline, elevate, enhance, bolster, underscore, showcase, embark, navigate, spearhead,',
  'supercharge; synergy, thought leadership, value-add, pain points, low-hanging fruit,',
  'move the needle, deep dive, double down, lean into, unpack, north star, game changer,',
  'paradigm shift; it\'s worth noting, at its core, in today\'s world, in the age of, when it',
  'comes to, in order to, the reality is, first and foremost, last but not least, a wide',
  'range of. PL: kluczowy, istotny (wypełniacz), niezwykle, niesamowity, przełomowy,',
  'innowacyjny (bez konkretu), rewolucyjny, kompleksowy, holistyczny, wielowymiarowy,',
  'dynamicznie zmieniający się, wyjątkowy, unikalny, nowoczesny, zaawansowany, potężny,',
  'bogaty (o ofercie), szeroki wachlarz, cały szereg, pełna gama; wykorzystywać (użyć),',
  'umożliwiać, ułatwiać, wspierać (w każdym zdaniu), wzmacniać, podkreślać, uwypuklać,',
  'stanowić (jest), odgrywać rolę, przyczyniać się do, zagłębić się, zanurzyć się, rzucić',
  'światło na, otworzyć drzwi do, wynieść na wyższy poziom, zoptymalizować (bez konkretu),',
  'usprawnić; synergia, wartość dodana, w dłuższej perspektywie, w kontekście, na',
  'przestrzeni lat, na ten moment, w chwili obecnej, idąc dalej, patrząc szerzej,',
  'konstruktywny dialog, holistyczne podejście, transformacja cyfrowa; warto zauważyć, warto',
  'podkreślić, warto wspomnieć, należy pamiętać, nie da się ukryć, nie ulega wątpliwości, jak',
  'wiadomo, w dzisiejszych czasach, w dzisiejszym dynamicznym świecie, w dobie, w erze, w',
  'obliczu, jeśli chodzi o, w zakresie, w celu, z uwagi na fakt, że, ma to na celu, stanowi',
  'doskonały przykład, stanowi świadectwo, jest kluczem do, "nie tylko…, ale także" and',
  '"zarówno…, jak i" as reflexes; Oczywiście, Jasne, Ponadto, Co więcej, Dodatkowo, Warto',
  'również, Co ciekawe, Co istotne, Podsumowując, Reasumując, W konkluzji, Ostatecznie.',
  'The replacement for a watched word is a concrete noun, verb, number or name from the',
  'evidence, never a synonym from the same register.',
].join(' ')

/** Format rules for the one channel this lane writes for: a social post. */
export const DESLOP_SOCIAL_FORMAT = [
  'Social post format: no "🧵", "Thread:", "Hot take:", "Unpopular opinion:", "Gorący temat:"',
  'openers; no hashtag stacks (zero to two, inside a sentence if at all); no',
  'line-per-sentence formatting to manufacture drama — paragraphs are allowed; no markdown',
  'headers or decorative bold; no emoji bullets; no fake-profound closing line; no',
  'credential opener. The post should contain at least one thing only this client could',
  'have written — a mechanism, a decision, a named limitation — and it must come from an',
  'evidence card.',
].join(' ')

/**
 * Write mode under a client profile (7.2). The ToV is the client's layer; deslop
 * is the hygiene layer underneath; the evidence payload is the whitelist of facts.
 */
export const DESLOP_WRITE_UNDER_PROFILE = [
  'You write under the client\'s voice profile (`tov`, `voice_extract`) with deslop as the',
  'hygiene layer underneath. Precedence: the profile wins on every stylistic choice — a',
  'structure the pattern list flags (a self-answered question, a metaphor, a rule-of-three',
  'list, a rhetorical opener) is allowed when `tov.wording.sentence_pattern`, a `style_axes`',
  'example or `voice_extract` shows the client using it on purpose, and then only as often',
  'as the profile allows; a word the profile prefers is fine even if watched; a word the',
  'profile bans (`wording.cliches`, `replacements`) is banned even if the list would pass it.',
  'Deslop wins only where the profile is silent, and rule 4 (never invent) holds under any',
  'profile: `evidence_payload` is the whitelist of facts; the ToV\'s examples show how the',
  'client sounds and never add a fact. Classify every claim by type and use the matching',
  '`tov.evidence_language` pattern; never perform a `forbidden_upgrade` (an observed fact',
  'does not become a quality claim). Before writing, check the profile status carried in',
  '`voice_extract` / `completion`: an unapproved ToV is written against only because the',
  'instruction authorises a draft in simulation — say so in `self_check.style_hygiene`.',
  'Where evidence is thin, narrow the claim or drop it; mark the borderline ones',
  '`used_within_evidence: false` with the `limitation` — never fill the gap with a number,',
  'a customer or an anecdote. Run the deslop patterns and words over your own text before',
  'returning it and fix what you find. `self_check.style_hygiene` (≤ 60 words): the profile',
  'id/version/status you wrote against, the patterns you removed, and any place the profile',
  'and the generic rule disagreed and which one you applied. Never mention the rules in',
  '`text` or `client_note`.',
].join(' ')

/**
 * Detect mode for the independent editor (7.3): findings, not rewrites; each
 * quotes the line, names the pattern, gives the fix in under ten words.
 */
export const DESLOP_DETECT_FOR_EDITOR = [
  'Run deslop in detect mode over `text` with the same profile the author had. After the',
  'evidence and instruction checks, list style findings: for each generic pattern found, each',
  '`typical_error` the ToV principles name, each `forbidden_upgrade` performed and each',
  'watched word doing generic work, one finding with `code: slop_pattern`, the exact',
  '`fragment`, the pattern name in `issue` and a `fix_hint` under ten words. The profile',
  'wins on style: a flagged structure the ToV sanctions is not a finding unless overused',
  'past the profile\'s own limit. Severity: `minor` for a single watched word or one',
  'pattern, `major` when patterns stack (three or more, or a kicker/recap ending, or an',
  'opener the channel forbids), `blocker` only when the fix would change a claim (an invented',
  'specific, a forbidden upgrade) — those keep their evidence codes (`unsourced_claim`,',
  '`invented_effectiveness`). Do not rewrite, do not score, do not claim who wrote it. The',
  'deterministic `validator_findings` may already carry `slop:` hits from the word lists —',
  'confirm or dismiss each in `checked` / `not_verified` rather than repeating it.',
].join(' ')
