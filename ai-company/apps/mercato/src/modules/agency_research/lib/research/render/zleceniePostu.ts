import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { ZleceniePostuData } from '../../../data/schemas/zleceniePostu'

/**
 * WEW-ZLECENIE-POSTU rendering — internal only (`client_projection.mode:
 * internal_only`): the instruction with the evidence card extract, never sent
 * to the client for another acceptance.
 */

const T = {
  pl: {
    title: 'Zlecenie postu',
    selected: 'Wybrany temat',
    task: 'Zadanie',
    evidence: 'Karty dowodów',
    reader: 'Wartość dla czytelnika',
    voice: 'Wyciąg z głosu marki',
    delivery: 'Ograniczenia dostawy',
    completion: 'Warunki ukończenia',
    issues: 'Luki i ograniczenia',
    limits: 'ograniczenia',
    rights: 'prawa',
    links: 'dozwolone linki',
    prohibited: 'zakazane twierdzenia',
    limit: 'limit platformy',
    unknown: 'nieznany',
  },
  en: {
    title: 'Post instruction',
    selected: 'Selected topic',
    task: 'Task',
    evidence: 'Evidence cards',
    reader: 'Reader value',
    voice: 'Voice extract',
    delivery: 'Delivery constraints',
    completion: 'Completion conditions',
    issues: 'Gaps and limitations',
    limits: 'limits',
    rights: 'rights',
    links: 'allowed links',
    prohibited: 'prohibited claims',
    limit: 'platform limit',
    unknown: 'unknown',
  },
} as const

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

export function renderZleceniePostu(args: { outputLanguage: 'pl' | 'en'; brand: string; data: ZleceniePostuData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  const item = data.selected_item
  const delivery = data.delivery_constraints
  const lines: string[] = [
    `# WEW-ZLECENIE-POSTU — ${args.brand}`,
    '',
    `## ${t.selected}`,
    `- ${item.topic_id} (${item.plan_id} v${item.plan_version}, ${item.selection_status}${item.decision_id ? `, ${item.decision_id}` : ''})`,
    `- ${item.audience}`,
    `- **${item.audience_question}** — ${item.main_message}`,
    `- ${item.goal}`,
    `- ${item.angle}`,
    '',
    `## ${t.task}`,
    item.task,
    '',
    `## ${t.evidence}`,
  ]
  for (const card of data.evidence_payload) {
    lines.push(
      `### ${card.claim_id} · ${card.kind} · ${card.provenance}`,
      card.text,
      `- ids: ${[card.fact_id, card.seed_id, ...card.fact_ids, ...card.source_ids].filter((id): id is string => Boolean(id)).join(', ') || '—'}`,
      ...card.source_payload.map((source) => `- ${source.source_id}: ${source.publisher} — ${source.url} (${source.access}; ${source.read_scope})`),
      `- ${t.limits}: ${card.limitations.join('; ') || '—'}`,
      ...(card.permitted_copy ? [`- ${card.permitted_copy}`] : []),
      `- ${t.rights}: ${card.rights_and_limits.source_visibility} · ${card.rights_and_limits.allowed_use} · client name ${card.rights_and_limits.client_name_permission} · quote ${card.rights_and_limits.quote_permission} · publication approval ${card.rights_and_limits.publication_approval}`,
      ...(card.reuse_of_evidence ? [`- ${card.reuse_of_evidence}`] : []),
      '',
    )
  }
  lines.push(
    `## ${t.reader}`,
    `- ${data.reader_value.type}: **${data.reader_value.title}** (${data.reader_value.status})`,
    ...data.reader_value.items.map((entry) => `  - ${entry}`),
    `- ${data.reader_value.usage}`,
    ...(data.reader_value.example_option ? [`- ${data.reader_value.example_option}`] : []),
    '',
    `## ${t.voice} (${data.voice_extract.tov_id} v${data.voice_extract.tov_version})`,
    bullets(data.voice_extract.rules),
    `- ✗ ${data.voice_extract.forbidden_cliches.join(', ') || '—'}`,
    `- ${data.voice_extract.short_pattern}`,
    '',
    `## ${t.delivery}`,
    `- ${delivery.channel} · ${delivery.language} · ${delivery.market} · ${delivery.format} · posts: ${delivery.finished_post_count}`,
    `- ${delivery.product_length_target.words[0]}–${delivery.product_length_target.words[1]} words (${delivery.product_length_target.word_count_rule})`,
    `- ${t.limit}: ${delivery.max_text_length !== null ? `${delivery.max_text_length} ${delivery.length_unit} — ${delivery.adapter_id}@${delivery.adapter_version}` : t.unknown} (${delivery.platform_limit_status})`,
    `- CTA: ${delivery.cta ?? '—'} → ${delivery.cta_destination ?? '—'} (draft ${delivery.cta_draft_readiness}, publication ${delivery.cta_publication_readiness})`,
    `- ${t.links}:`,
    ...delivery.links.map((link) => `  - ${link.url} — ${link.purpose} (${link.visibility_status}, ${link.operational_status}; owner ${link.owner ?? '—'})`),
    `- ${t.prohibited}:`,
    ...delivery.prohibited_claims.map((claim) => `  - ${claim}`),
    '',
    `## ${t.completion}`,
    ...data.completion.map((line, index) => `${index + 1}. ${line}`),
    '',
    `## ${t.issues}`,
    bullets(args.issues.map((issue) => `${issue.code}${issue.path ? ` (${issue.path})` : ''}: ${issue.detail}`)),
    '',
  )
  return lines.join('\n')
}
