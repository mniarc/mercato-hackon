import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { PostData } from '../../../data/schemas/post'
import { limits } from '../../../data/templates'
import type { ClientView } from '../clientView'
import { countClientWords } from '../util'

/**
 * KLI-POST rendering. The client view follows WZR-POST's projection (mode
 * `approval`): the exact text, the platform line and the client note — never the
 * claims map or the qa block. The 80-word budget of the projection binds the
 * note; the text has its own target and adapter limit, counted in `qa.metrics`.
 */

const T = {
  pl: {
    title: 'Post do akceptacji',
    target: 'Kanał',
    note: 'Od agencji',
    text: 'Treść',
    version: 'wersja',
    claims: 'Mapa twierdzeń',
    links: 'Linki i wzmianki',
    qa: 'Kontrola jakości',
    editor: 'Kontrola redaktora',
    pending: 'jeszcze nie przeprowadzona',
    metrics: 'Metryki',
    checks: 'Kontrole copy',
    issues: 'Luki i ograniczenia',
    limitUnknown: 'limit platformy nieznany',
  },
  en: {
    title: 'Post for approval',
    target: 'Channel',
    note: 'From the agency',
    text: 'Text',
    version: 'version',
    claims: 'Claims map',
    links: 'Links and mentions',
    qa: 'Quality control',
    editor: 'Editor review',
    pending: 'not yet performed',
    metrics: 'Metrics',
    checks: 'Copy checks',
    issues: 'Gaps and limitations',
    limitUnknown: 'platform limit unknown',
  },
} as const

function targetLine(data: PostData, t: (typeof T)['pl'] | (typeof T)['en']): string {
  const limit = data.target.platform_character_limit !== null ? `${data.target.platform_character_limit} ${data.target.language === 'pl' || data.target.language.startsWith('pl') ? 'znaków' : 'characters'}` : t.limitUnknown
  return `${data.target.channel} · ${data.target.language} · ${data.target.format} · ${limit}`
}

export function renderPostClientView(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PostData }): ClientView {
  const { data } = args
  const t = T[args.outputLanguage]
  const markdown = [
    `# ${t.title} — ${args.brand}`,
    '',
    `**${t.target}:** ${targetLine(data, t)}`,
    '',
    `## ${t.text}`,
    '',
    data.text,
    '',
    `## ${t.note}`,
    '',
    data.client_note,
    '',
  ].join('\n')
  const limit = limits.clientText.postClientNoteWordsMax
  const words = countClientWords(data.client_note)
  const issue: DocumentIssue | null = words > limit ? { code: 'CLIENT_VIEW_OVER_BUDGET', severity: 'limitation', detail: `client note has ${words} words, limit ${limit}`, path: 'client_note' } : null
  return { markdown, words, limit, issue }
}

/** Internal markdown: the text, every claims-map row with its ids, links, the qa block — for staff and the editor. */
export function renderPost(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PostData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  const editor = data.qa.independent_editor_review
  const metrics = data.qa.metrics
  return [
    `# KLI-POST — ${args.brand} (${t.version} ${data.qa.author_review_version})`,
    '',
    `**${t.target}:** ${targetLine(data, t)} · ${data.target.publication_status} · adapter ${data.target.adapter_id ?? '—'} ${data.target.adapter_version ?? ''}`.trim(),
    '',
    `## ${t.text}`,
    '',
    data.text,
    '',
    `## ${t.note}`,
    data.client_note,
    '',
    `## ${t.claims}`,
    ...(data.claims_map.length
      ? data.claims_map.map((row) => `- **${row.id}** „${row.fragment}” → ${row.claim_id ?? '—'} · ${row.kind} / ${row.evidence_kind} · facts: ${row.fact_ids.join(', ') || '—'} · seeds: ${row.creative_payload_ids.join(', ') || '—'} · sources: ${row.source_ids.join(', ') || '—'} · ${row.limitation}`)
      : ['- —']),
    '',
    `## ${t.links}`,
    ...(data.links_and_mentions.length ? data.links_and_mentions.map((row) => `- ${row.type}: ${row.value} — ${row.purpose} · ${row.verification_status} · ${row.operational_status} · owner: ${row.owner ?? '—'}`) : ['- —']),
    '',
    `## ${t.qa}`,
    `- status: ${data.qa.status} · ${data.qa.review_type}`,
    `- publication_gate: ${data.qa.publication_gate} · real_approval_recorded: ${data.qa.real_approval_recorded}`,
    `- instruction: ${data.qa.instruction_alignment}`,
    `- facts: ${data.qa.factual_scope} · unsupported_facts_added: ${data.qa.unsupported_facts_added}`,
    `- tone: ${data.qa.tone_of_voice}`,
    `- format: ${data.qa.format}`,
    `- links: ${data.qa.links}`,
    ...(data.qa.corrections_applied.length ? [`- corrections: ${data.qa.corrections_applied.join(', ')} — ${data.qa.corrections_note ?? ''}`] : []),
    '',
    `### ${t.metrics}`,
    `- words: ${metrics.word_count} (target ${metrics.words_target[0]}–${metrics.words_target[1]}, ${metrics.within_internal_word_target ? 'ok' : 'missed'}) · characters: ${metrics.character_count_with_spaces_and_newlines} · limit: ${metrics.platform_character_limit ?? '—'} (${metrics.platform_limit_compliance}) · line breaks: ${metrics.line_break_count} · note words: ${metrics.client_note_word_count}/${metrics.client_note_max_words}`,
    '',
    `### ${t.checks}`,
    ...data.qa.copy_checks.map((check) => `- ${check.id} ${check.question} — **${check.result}** · ${check.evidence}`),
    '',
    `### ${t.editor}`,
    ...(editor
      ? [
          `- ${editor.reviewer} · ${editor.review_type} · **${editor.result}**`,
          ...editor.checked.map((item) => `- ✓ ${item}`),
          ...editor.not_verified.map((item) => `- ? ${item}`),
          ...editor.findings.map((finding) => `- ${finding.severity} ${finding.code}: ${finding.issue}${finding.fragment ? ` („${finding.fragment}”)` : ''} → ${finding.fix_hint}`),
        ]
      : [`- ${t.pending}`]),
    '',
    `## ${t.issues}`,
    ...(args.issues.length ? args.issues.map((item) => `- ${item.code} (${item.severity})${item.path ? ` @ ${item.path}` : ''}: ${item.detail}`) : ['- —']),
    '',
  ].join('\n')
}
