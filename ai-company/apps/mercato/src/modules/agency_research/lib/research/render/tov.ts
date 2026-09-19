import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { TovData } from '../../../data/schemas/tov'
import { checkClientView, type ClientView } from '../clientView'

/**
 * KLI-TOV rendering. The client view follows WZR-TOV's projection: 500–750
 * words, four principles, a do/don't table and three short example pairs; no
 * repetition of the strategy or the source registers. The view never
 * overwrites the data.
 */

const T = {
  pl: {
    title: 'Głos marki',
    principles: 'Cztery zasady głosu',
    purpose: 'po co',
    behavior: 'jak pisać',
    error: 'typowy błąd',
    axes: 'Parametry stylu',
    axis: { formality: 'Formalność', directness: 'Bezpośredniość', technicality: 'Techniczność', humor: 'Humor', claim_strength: 'Siła twierdzeń' },
    changeWhen: 'zmienia się, gdy',
    wording: 'Słownik',
    doColumn: 'Piszemy',
    dontColumn: 'Nie piszemy',
    cliches: 'Zakazane klisze',
    expertTerms: 'Terminy eksperckie',
    sentence: 'Wzorzec zdania',
    evidence: 'Jak mówimy o dowodach',
    evidenceType: { fact: 'fakt', first_party_claim: 'własna deklaracja', hypothesis: 'hipoteza', illustrative_example: 'przykład ilustracyjny', limitation: 'ograniczenie' },
    forbiddenUpgrade: 'nie podnosimy do',
    examples: 'Przed / po',
    before: 'Przed',
    after: 'Po',
    principle: 'zmieniona zasada',
    creative: 'przykład twórczy',
    grounded: 'na faktach',
    context: 'Sytuacje',
    boundary: 'granica',
    checks: 'Lista kontrolna redaktora',
    issues: 'Luki i ograniczenia',
  },
  en: {
    title: 'Brand voice',
    principles: 'Four voice principles',
    purpose: 'why',
    behavior: 'how to write',
    error: 'typical error',
    axes: 'Style parameters',
    axis: { formality: 'Formality', directness: 'Directness', technicality: 'Technicality', humor: 'Humour', claim_strength: 'Claim strength' },
    changeWhen: 'shifts when',
    wording: 'Wording',
    doColumn: 'We write',
    dontColumn: 'We do not write',
    cliches: 'Banned clichés',
    expertTerms: 'Expert terms',
    sentence: 'Sentence pattern',
    evidence: 'How we speak about evidence',
    evidenceType: { fact: 'fact', first_party_claim: 'own declaration', hypothesis: 'hypothesis', illustrative_example: 'illustrative example', limitation: 'limitation' },
    forbiddenUpgrade: 'never upgraded to',
    examples: 'Before / after',
    before: 'Before',
    after: 'After',
    principle: 'principle changed',
    creative: 'creative example',
    grounded: 'on facts',
    context: 'Situations',
    boundary: 'boundary',
    checks: "Editor's checklist",
    issues: 'Gaps and limitations',
  },
} as const

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

export function renderTovClientView(args: { outputLanguage: 'pl' | 'en'; brand: string; data: TovData }): ClientView {
  const { data } = args
  const t = T[args.outputLanguage]
  const lines: string[] = [
    `# ${t.title} — ${args.brand}`,
    '',
    `## ${t.principles}`,
    ...data.voice_principles.map((p, index) => `${index + 1}. **${p.trait}** — ${t.purpose}: ${p.purpose} ${t.behavior}: ${p.author_behavior} ${t.error}: ${p.typical_error}`),
    '',
    `## ${t.axes}`,
    ...data.style_axes.map((a) => `- **${t.axis[a.axis]}:** ${a.position} _${a.example}_ (${t.changeWhen}: ${a.change_when})`),
    '',
    `## ${t.wording}`,
    `| ${t.doColumn} | ${t.dontColumn} |`,
    '|---|---|',
    ...data.wording.replacements.map((r) => `| ${r.use} | ${r.avoid} |`),
    '',
    `**${t.cliches}:** ${data.wording.cliches.join(', ') || '—'}`,
    `**${t.expertTerms}:** ${data.wording.expert_terms}`,
    `**${t.sentence}:** ${data.wording.sentence_pattern}`,
    '',
    `## ${t.evidence}`,
    ...data.evidence_language.map((e) => `- **${t.evidenceType[e.type]}:** ${e.pattern} (${t.forbiddenUpgrade}: ${e.forbidden_upgrade})`),
    '',
    `## ${t.examples}`,
    ...data.before_after.flatMap((pair) => [`- **${t.before}:** ${pair.before}`, `  **${t.after}:** ${pair.after} _(${t.principle}: ${pair.changed_principle}; ${pair.status === 'grounded' ? t.grounded : t.creative})_`]),
    '',
    `## ${t.checks}`,
    ...data.copy_checks.map((check, index) => `${index + 1}. ${check}`),
    '',
  ]
  return checkClientView('WZR-TOV', lines.join('\n'))
}

/** Internal markdown: every field with its ids and statuses — for staff and QA. */
export function renderTov(args: { outputLanguage: 'pl' | 'en'; brand: string; data: TovData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  return [
    `# KLI-TOV — ${args.brand}`,
    '',
    `## ${t.principles}`,
    ...data.voice_principles.map((p) => `- **${p.trait}** — ${p.purpose} · ${p.author_behavior} · ${t.error}: ${p.typical_error}`),
    '',
    `## ${t.axes}`,
    ...data.style_axes.map((a) => `- ${a.axis}: ${a.position} · ${a.example} · ${t.changeWhen}: ${a.change_when}`),
    '',
    `## ${t.wording}`,
    `- preferred: ${data.wording.preferred_in_context.join('; ') || '—'}`,
    ...data.wording.replacements.map((r) => `- ${r.avoid} → ${r.use}`),
    `- boundary: ${data.wording.replacement_boundary}`,
    `- ${t.cliches}: ${data.wording.cliches.join(', ') || '—'}`,
    `- ${t.expertTerms}: ${data.wording.expert_terms}`,
    `- ${t.sentence}: ${data.wording.sentence_pattern}`,
    '',
    `## ${t.evidence}`,
    ...data.evidence_language.map((e) => `- ${e.type}: ${e.pattern} · ${t.forbiddenUpgrade}: ${e.forbidden_upgrade}`),
    '',
    `## ${t.examples}`,
    ...data.before_after.map((pair) => `- [${pair.status}; ${pair.fact_ids.join(', ') || '—'}] ${pair.before} → ${pair.after} (${pair.changed_principle})`),
    '',
    `## ${t.context}`,
    bullets(data.context_rules.map((r) => `${r.situation}: ${r.tone_and_example} · ${t.boundary}: ${r.boundary}`)),
    '',
    `## ${t.checks}`,
    ...data.copy_checks.map((check, index) => `${index + 1}. ${check}`),
    '',
    `## ${t.issues} (${args.issues.length})`,
    bullets(args.issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}
