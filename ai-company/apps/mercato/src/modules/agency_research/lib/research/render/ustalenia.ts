import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'

/**
 * WEW-USTALENIA renders: the internal map (every row with its evidence and
 * decision state) and the client projection — at most the batch of questions,
 * each with its hint and a one-sentence reason (WZR-USTALENIA `client_projection`:
 * mode `questions`, source fields `questions` + `evidence_requests`).
 */

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

export function renderUstalenia(args: { brand: string; data: UstaleniaData; issues: DocumentIssue[] }): string {
  const { data, issues } = args
  return [
    `# WEW-USTALENIA — ${args.brand}`,
    '',
    '## Mapowanie danych do pól briefu',
    '| pole | priorytet | status wiedzy | gotowość | decyzja | dowody | propozycja |',
    '|---|---|---|---|---|---|---|',
    ...data.field_map.map((r) => `| ${r.field_key} | ${r.priority} | ${r.status} | ${r.readiness} | ${r.decision_state} | ${r.evidence_ids.join(', ') || '—'} | ${(r.proposed_value ?? '—').replace(/\|/g, '/').slice(0, 160)} |`),
    '',
    ...data.field_map.flatMap((r) => [`- **${r.field_key}** (${r.provenance}): ${r.reason}`]),
    '',
    `## Pytania do klienta (${data.questions.length})`,
    ...data.questions.flatMap((q) => [
      `### ${q.question_id} · ${q.priority} · ${q.brief_field}`,
      q.question,
      '',
      `- **Podpowiedź:** ${q.hint}`,
      `- **Dlaczego:** ${q.reason}`,
      `- **Bez odpowiedzi:** ${q.if_unanswered}`,
      ...(q.options ? q.options.map((o) => `- **${o.variant_id} — ${o.label}:** ${o.text} (${o.fact_ids.join(', ') || 'bez faktu'})`) : []),
      '',
    ]),
    `## Prośby o dowody (${data.evidence_requests.length})`,
    bullets(data.evidence_requests.map((r) => `**${r.request_id}** [${r.priority}, ${r.owner}] ${r.needed} — wspiera: ${r.claim_supported}; bez tego: ${r.without_it}`)),
    '',
    '## Gotowość rezultatów',
    '| rezultat | stan | pola wejściowe | brak | właściciel |',
    '|---|---|---|---|---|',
    ...data.readiness.map((r) => `| ${r.output} | ${r.state} | ${r.input_fields.join(', ') || '—'} | ${r.missing ?? '—'} | ${r.owner} |`),
    '',
    `## Zadania uzupełnienia researchu (${data.research_return.length})`,
    bullets(data.research_return.map((r) => `${r.question} → ${r.source_to_check} (${r.owner_step}; limit ${r.limit}; stop: ${r.stop_condition})`)),
    '',
    `## Luki i ograniczenia (${issues.length})`,
    bullets(issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}

/** The client sees only the questions of this batch, with a hint and a reason — never the register. */
export function renderUstaleniaClientView(data: UstaleniaData): string {
  return [
    '# Pytania do briefu',
    '',
    ...data.questions.flatMap((q, index) => [
      `**${index + 1}. ${q.question}**`,
      `Podpowiedź: ${q.hint}`,
      `Dlaczego pytamy: ${q.reason}`,
      ...(q.options ? q.options.map((o) => `- ${o.label}: ${o.text}`) : []),
      '',
    ]),
    ...(data.evidence_requests.length ? ['Materiały, które pomogą (tylko jeśli je macie):', ...data.evidence_requests.map((r) => `- ${r.needed}`), ''] : []),
  ].join('\n')
}
