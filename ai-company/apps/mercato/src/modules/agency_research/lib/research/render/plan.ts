import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { PlanData, PlanTopic } from '../../../data/schemas/plan'
import { clientProjectionOf } from '../../../data/contracts'
import type { ClientView } from '../clientView'
import { countClientWords } from '../util'

/**
 * KLI-PLAN rendering. The client view follows WZR-PLAN's projection: one table
 * of twelve rows (day, pillar, question/topic, concrete angle and value,
 * goal/CTA) with at most 55 words per row, one topic marked for production, and
 * a commentary outside the table within the 150-word budget. Claim/seed/fact ids
 * and readiness enums stay internal. The view never overwrites the data.
 */

export const ROW_WORDS_MAX = 55

const T = {
  pl: {
    title: 'Plan treści na 30 dni',
    intro: (channel: string, count: number) => `${count} tematów na kanał ${channel}. To harmonogram tematów, nie ${count} gotowych postów — kupiony rezultat to jeden tekst.`,
    columns: ['Dzień', 'Filar', 'Pytanie odbiorcy / temat', 'Ujęcie i wartość', 'Cel / CTA'],
    recommended: 'rekomendowany do produkcji',
    selected: 'wybrany do produkcji',
    simulatedSelected: 'wybrany w symulacji (bez decyzji klienta)',
    whyRecommended: 'Dlaczego ten temat',
    balance: 'Równowaga planu',
    selection: 'Wybór tematu',
    awaiting: 'Czekamy na akceptację planu i wskazanie jednego tematu.',
    internal: 'Dane wewnętrzne',
    issues: 'Luki i ograniczenia',
    context: 'Kontekst',
    evidence: 'Dowody',
    limits: 'Czego nie twierdzić',
    readiness: 'gotowość',
    simulation: 'Symulacja: dokumenty bazowe nie mają decyzji klienta.',
  },
  en: {
    title: '30-day content plan',
    intro: (channel: string, count: number) => `${count} topics for ${channel}. A schedule of topics, not ${count} finished posts — the purchased result is one text.`,
    columns: ['Day', 'Pillar', 'Audience question / topic', 'Angle and value', 'Goal / CTA'],
    recommended: 'recommended for production',
    selected: 'selected for production',
    simulatedSelected: 'selected in simulation (no client decision)',
    whyRecommended: 'Why this topic',
    balance: 'Plan balance',
    selection: 'Topic selection',
    awaiting: 'Awaiting plan approval and one selected topic.',
    internal: 'Internal data',
    issues: 'Gaps and limitations',
    context: 'Context',
    evidence: 'Evidence',
    limits: 'What not to claim',
    readiness: 'readiness',
    simulation: 'Simulation: the base documents carry no client decision.',
  },
} as const

const cell = (text: string) => text.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim()

function rowMark(t: (typeof T)['pl'] | (typeof T)['en'], data: PlanData, topic: PlanTopic): string {
  if (data.selected_topic.topic_id === topic.topic_id) return ` **(${data.selected_topic.status === 'client_selected' ? t.selected : t.simulatedSelected})**`
  if (data.recommendation.topic_id === topic.topic_id) return ` **(${t.recommended})**`
  return ''
}

/** The row's prose, trimmed to the projection's per-row budget: the angle's tool first, its steps only while they fit. */
export function clientRow(t: (typeof T)['pl'] | (typeof T)['en'], data: PlanData, topic: PlanTopic): string {
  const mark = rowMark(t, data, topic)
  const fixed = [String(topic.day), topic.pillar_id, `${topic.audience_question} — ${topic.topic}`, '', `${topic.post_goal} ${topic.cta}`]
  // The goal/CTA column gives way first: the goal stays, the CTA sentence is what the post carries anyway.
  if (countClientWords(`${fixed.join(' ')} ${mark}`) + countClientWords(topic.angle.tool) > ROW_WORDS_MAX) fixed[4] = topic.post_goal
  const fixedWords = countClientWords(`${fixed.join(' ')} ${mark}`)
  const angleParts = [topic.angle.tool, ...topic.angle.steps]
  const angle: string[] = []
  let used = fixedWords
  for (const part of angleParts) {
    const words = countClientWords(part)
    if (used + words > ROW_WORDS_MAX) break
    angle.push(part)
    used += words
  }
  if (!angle.length) angle.push(topic.angle.tool)
  fixed[3] = angle.join('; ')
  return `| ${fixed.map(cell).join(' | ')}${mark} |`
}

export function renderPlanClientView(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PlanData }): ClientView {
  const { data } = args
  const t = T[args.outputLanguage]
  const rows = [...data.topics].sort((a, b) => a.day - b.day).map((topic) => clientRow(t, data, topic))
  const commentary = [
    `## ${t.whyRecommended}`,
    `${data.recommendation.topic_id}: ${data.recommendation.reason} ${data.recommendation.role}`,
    '',
    `## ${t.balance}`,
    data.balance.need_stages,
    data.balance.evidence_diversity,
    '',
    `## ${t.selection}`,
    data.selected_topic.topic_id ? `${data.selected_topic.topic_id} — ${data.selected_topic.status === 'client_selected' ? t.selected : t.simulatedSelected}.` : t.awaiting,
  ].join('\n')
  const markdown = [
    `# ${t.title} — ${args.brand}`,
    '',
    t.intro(data.plan_context.channel, data.plan_context.topic_count),
    '',
    `| ${t.columns.join(' | ')} |`,
    `| ${t.columns.map(() => '---').join(' | ')} |`,
    ...rows,
    '',
    commentary,
    '',
  ].join('\n')
  const limit = clientProjectionOf('WZR-PLAN').word_limit
  const words = countClientWords(commentary)
  const longRows = rows.filter((row) => countClientWords(row) > ROW_WORDS_MAX).length
  const issue: DocumentIssue | null =
    limit !== null && words > limit
      ? { code: 'CLIENT_VIEW_OVER_BUDGET', severity: 'limitation', detail: `plan commentary has ${words} words, limit ${limit}`, path: 'client_view' }
      : longRows
        ? { code: 'CLIENT_VIEW_ROW_OVER_BUDGET', severity: 'limitation', detail: `${longRows} plan rows exceed ${ROW_WORDS_MAX} words`, path: 'client_view.table' }
        : null
  return { markdown, words, limit, issue }
}

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

/** Internal markdown: every topic with ids, evidence excerpt, limits and readiness — for staff and QA. */
export function renderPlan(args: { outputLanguage: 'pl' | 'en'; brand: string; data: PlanData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  const lines: string[] = [
    `# KLI-PLAN — ${args.brand}`,
    '',
    `## ${t.context}`,
    `- ${data.plan_context.channel} · ${data.plan_context.relative_days}`,
    `- ${data.plan_context.audience}`,
    `- topics: ${data.plan_context.topic_count} · finished posts in scope: ${data.plan_context.finished_posts_in_scope}`,
    `- versions: ${Object.entries(data.plan_context.versions)
      .map(([id, version]) => `${id} v${version}`)
      .join(', ')}`,
    ...(data.plan_context.simulation_flag ? [`- ${t.simulation}`] : []),
    '',
  ]
  for (const topic of [...data.topics].sort((a, b) => a.day - b.day)) {
    lines.push(
      `## ${topic.topic_id} · day ${topic.day} · ${topic.pillar_id}${rowMark(t, data, topic)}`,
      `**${topic.audience_question}** — ${topic.topic}`,
      topic.main_message,
      `- ${topic.angle.tool} (${topic.angle.status})`,
      ...topic.angle.steps.map((step) => `  - ${step}`),
      ...(topic.angle.example ? [`  - _${topic.angle.example.text}_ (${topic.angle.example.status})`] : []),
      `- ${t.evidence}: ${[...topic.claim_ids, ...topic.seed_ids, ...topic.fact_ids, ...topic.proof_ids, ...topic.source_ids].join(', ') || '—'}`,
      `- ${topic.evidence_excerpt}`,
      `- ${t.limits}: ${topic.evidence_limits}`,
      `- ${topic.post_goal} · CTA (${topic.cta_type}): ${topic.cta}`,
      `- ${t.readiness}: ${topic.readiness} — ${topic.readiness_scope}`,
      ...(topic.evidence_reuse_note ? [`- ${topic.evidence_reuse_note}`] : []),
      '',
    )
  }
  lines.push(
    `## ${t.balance}`,
    `- ${Object.entries(data.balance.pillar_counts)
      .map(([pillar, count]) => `${pillar}: ${count}`)
      .join(', ')}`,
    `- ${data.balance.need_stages}`,
    `- ${data.balance.distinctness}`,
    `- ${data.balance.evidence_diversity}`,
    '',
    `## ${t.whyRecommended}`,
    `- ${data.recommendation.topic_id} (${data.recommendation.readiness}): ${data.recommendation.reason}`,
    `- ${data.recommendation.role}`,
    `- ${t.evidence}: ${data.recommendation.evidence_available.join(', ') || '—'}`,
    '',
    `## ${t.selection}`,
    `- ${data.selected_topic.topic_id ?? '—'} · ${data.selected_topic.status} · real_approval: ${data.selected_topic.real_approval}`,
    ...(data.selected_topic.decision_text ? [`- ${data.selected_topic.decision_text}`] : []),
    '',
    `## ${t.issues}`,
    bullets(args.issues.map((issue) => `${issue.code}${issue.path ? ` (${issue.path})` : ''}: ${issue.detail}`)),
    '',
  )
  return lines.join('\n')
}
