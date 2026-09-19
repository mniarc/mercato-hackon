import type { QaFinding } from '../../data/schemas/qa'

/**
 * The deterministic half of the `deslop` skill (`.ai/skills/deslop`, v0.3): the
 * phrases and budgets a regex can check. It runs in code before the editor
 * (7.3) so the model does not have to spot the obvious. Everything here is a
 * *detector*, not a ban — the findings are `minor` (one pattern) or `major`
 * (patterns stack), never blocking on their own; the editor confirms or
 * dismisses each with the ToV in hand. The lists are the skill's `words.md`
 * cut down to entries that are wrong in a client post in any voice; a watched
 * word that is sometimes right ("kluczowy", "robust") is left to the editor.
 */

export type SlopHit = {
  /** The catalogue name the skill uses. */
  pattern: string
  /** Verbatim run of the text, or null for a whole-text budget. */
  fragment: string | null
  /** The fix, under ten words. */
  fix: string
}

type PhraseRule = { pattern: string; fix: string; re: RegExp }

/** `\b` is ASCII-only under the `u` flag, so Polish letters need explicit word edges. */
const W_START = '(?<![\\p{L}\\p{N}])'
const W_END = '(?![\\p{L}\\p{N}])'
/** A leading or trailing `\b` in a source is rewritten to the letter-aware edge; sentence-start anchors stay as written. */
const phrase = (pattern: string, fix: string, source: string): PhraseRule => ({
  pattern,
  fix,
  re: new RegExp(source.replace(/^\\b/, W_START).replace(/\\b$/, W_END), 'giu'),
})

/** Openers a social post never needs (channels.md → social). */
const SOCIAL_OPENERS: PhraseRule[] = [
  phrase('channel opener', 'delete the opener', '(?:^|\\n)\\s*(?:🧵|thread:|hot take:|unpopular opinion:|gorący temat:|niepopularna opinia:|wątek:)'),
]

/** Phrases that are filler in any voice: response-shaped connectors, throat-clearing, recap endings, weasel attribution. */
const FILLER_PHRASES: PhraseRule[] = [
  phrase('throat-clearing opener', 'delete, start at the point', "\\b(?:here'?s the thing|let me be clear|the truth is|the uncomfortable truth|it goes without saying|needless to say|prawda jest taka|nie da się ukryć|nie ulega wątpliwości|jak powszechnie wiadomo|szczerze mówiąc)\\b"),
  phrase('faux-insight setup', 'delete the frame, state the claim', '\\b(?:what nobody tells you|the part everyone misses|most people get this wrong|większość (?:firm|ludzi|osób) robi to źle|czego nikt ci nie powie|o czym nikt nie mówi)\\b'),
  phrase('scene-setting without a scene', 'delete or name the actual change', "\\b(?:in today'?s (?:fast-paced |ever-changing |digital )?world|in the age of|in an ever-changing|w dzisiejszych czasach|w dzisiejszym (?:dynamicznym |szybko zmieniającym się )?świecie|w dobie (?:cyfryzacji|ai|sztucznej inteligencji|transformacji)|w erze (?:cyfrowej|ai))\\b"),
  phrase('importance label', 'delete the label', '\\b(?:importantly|notably|interestingly|crucially|co istotne|co ciekawe|warto (?:zauważyć|podkreślić|wspomnieć|dodać)|należy (?:pamiętać|podkreślić))\\b'),
  phrase('response-shaped connector', 'cut the connector', '(?:^|[.!?]\\s+|\\n\\s*)(?:moreover|furthermore|additionally|ponadto|co więcej|dodatkowo|warto również)\\b'),
  phrase('recap ending', 'cut the recap', '(?:^|[.!?]\\s+|\\n\\s*)(?:in conclusion|to sum up|ultimately|podsumowując|reasumując|w konkluzji|ostatecznie)\\b'),
  phrase('weasel attribution', 'name the source or cut', '\\b(?:experts agree|studies show|research shows|industry reports suggest|it is widely believed|eksperci są zgodni|badania (?:pokazują|dowodzą|wskazują)|jak pokazują badania)\\b'),
  phrase('rhetorical priming', 'answer it as a statement', '\\b(?:what if i told you|imagine a world where|ever wondered why|wyobraź sobie świat|czy zastanawiał[ae]ś się kiedyś)\\b'),
  phrase('importance puffery', 'state what happened', '\\b(?:a testament to|marks a pivotal moment|game[- ]changer|paradigm shift|stanowi (?:świadectwo|doskonały przykład)|przełomow[aey]|rewolucyjn[aey]|prawdziwy game[- ]changer)\\b'),
  phrase('business-speak', 'say what actually happens', '\\b(?:synerg(?:y|ia|ii|ię)|low-hanging fruit|move the needle|thought leadership|wartość dodan[aą]|transformacj[aię] cyfrow[aąej])\\b'),
  phrase('inflation word', 'replace with the concrete thing', '\\b(?:delve|tapestry|seamless(?:ly)?|cutting-edge|groundbreaking|world-class|best-in-class|niezwykle|niesamowit[aey]|szeroki wachlarz|cały szereg|pełn[aą] gam[aę])\\b'),
  phrase('call-to-action boilerplate', 'name the one next step or cut', "\\b(?:i hope this helps|feel free to reach out|don'?t hesitate to|mam nadzieję, że to pomoże|w razie pytań pozostaj[eę] do dyspozycji|nie wahaj się)\\b"),
]

const BINARY_CONTRAST = /(?<![\p{L}\p{N}])(?:it'?s not (?:about )?[^.!?\n]{2,60}[.,;] (?:it'?s|but) |this isn'?t about [^.!?\n]{2,60}[.,;] it'?s about |to nie (?:jest )?[^.!?\n]{2,60}\. to |nie chodzi o [^.!?\n]{2,60}[.,;] chodzi o )/giu

const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu

/** Runs the detectors over one post text. Order: channel openers, phrases, structures, budgets. */
export function scanSlop(text: string): SlopHit[] {
  const hits: SlopHit[] = []
  const seen = new Set<string>()
  const push = (pattern: string, fragment: string | null, fix: string) => {
    const key = `${pattern}|${fragment?.toLowerCase() ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ pattern, fragment, fix })
  }
  for (const rule of [...SOCIAL_OPENERS, ...FILLER_PHRASES]) {
    for (const match of text.matchAll(rule.re)) push(rule.pattern, match[0].trim(), rule.fix)
  }
  for (const match of text.matchAll(BINARY_CONTRAST)) push('binary contrast', match[0].trim(), 'state the second half as a plain claim')

  const hashtags = text.match(HASHTAG) ?? []
  if (hashtags.length > 2) push('hashtag stack', null, `${hashtags.length} hashtags; keep at most two`)
  const emDashes = (text.match(/[—–]/g) ?? []).length
  if (emDashes > 2) push('em-dash habit', null, `${emDashes} dashes; keep one or two`)
  const exclamations = (text.match(/!/g) ?? []).length
  if (exclamations > 1) push('exclamation habit', null, `${exclamations} exclamation marks; keep one at most`)
  if (/\.\.\.|…/.test(text) && (text.match(/\.\.\.|…/g) ?? []).length > 1) push('ellipsis habit', null, 'ellipsis only for a real trailing-off')

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const oneSentenceLines = lines.filter((line) => /^[^.!?]*[.!?]$/.test(line) && !/^[-*•\d]/.test(line))
  if (lines.length >= 6 && oneSentenceLines.length / lines.length > 0.75) push('line-per-sentence drama', null, 'group the sentences into paragraphs')
  if (/^\s*#{1,6}\s/m.test(text) || /\*\*[^*\n]+\*\*/.test(text)) push('markdown in a social post', null, 'plain text: no headers, no bold')
  if (/^\s*(?:✅|✔️|👉|🔥|💡|⭐|🚀)\s/mu.test(text)) push('emoji bullets', null, 'plain lines or one emoji as tone')
  return hits
}

/**
 * The hits as Q-T validator findings: never blocking alone (`minor`; `major`
 * when three or more stack) — the editor confirms them with the profile in hand.
 */
export function slopValidatorFindings(text: string, path = 'KLI-POST.text'): QaFinding[] {
  const hits = scanSlop(text)
  const severity: QaFinding['severity'] = hits.length >= 3 ? 'major' : 'minor'
  return hits.map((hit) => ({
    code: 'slop_pattern',
    path: hit.fragment ? `${path}["${hit.fragment.slice(0, 40)}"]` : path,
    severity,
    gap: `slop: ${hit.pattern}${hit.fragment ? ` — "${hit.fragment}"` : ''}`,
    owner: 'agent',
    fix_step: '7.2',
    fix_hint: hit.fix,
  }))
}
