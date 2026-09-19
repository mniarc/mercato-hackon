import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { KonkurencjaData } from '../../../data/schemas/konkurencja'
import { clientProjectionOf } from '../../../data/contracts'
import { trimToBudget } from '../clientView'

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

const cell = (d: { text: string; fact_ids: string[] }) => `${d.text}${d.fact_ids.length ? ` (${d.fact_ids.join(', ')})` : ''}`

export function renderKonkurencja(args: { brand: string; data: KonkurencjaData; issues: DocumentIssue[]; versionLabel: string }): string {
  const { data, issues } = args
  return [
    `# WEW-KONKURENCJA — ${args.brand} (v${args.versionLabel})`,
    '',
    `## Dobór konkurentów (${data.selection.length})`,
    ...data.selection.map((s) => `- **${s.company}** (${s.url}) · ${s.competition_type}: ${s.shared_problem_scope}; skala/rynek: ${s.market_scale_difference}; powód: ${s.reason}`),
    '',
    `## Karty (${data.cards.length})`,
    ...data.cards.flatMap((c) => [
      `### ${c.company} · ${c.category}`,
      `- **Segment:** ${cell(c.market_segment)}`,
      `- **Problem:** ${cell(c.problem)}`,
      `- **Usługa:** ${cell(c.service)}`,
      `- **Przekaz:** ${cell(c.message)}`,
      `- **Mechanizm:** ${cell(c.mechanism)}`,
      `- **Dowód:** ${cell(c.proof)}`,
      `- **CTA:** ${cell(c.cta)}`,
      `- **Język:** ${cell(c.language)}`,
      `- **Kanały:** potwierdzone ${c.channels.confirmed.join(', ') || '—'}; niezweryfikowane ${c.channels.unverified.join(', ') || '—'}`,
      `- **Porównywalność:** ${c.comparability}`,
      `- **Niewiadome:** ${c.unknowns.join('; ') || '—'}`,
      '',
    ]),
    `## Obietnice powszechne w kategorii (${data.parity_claims.length})`,
    ...data.parity_claims.map((p) => `- **${p.claim}** — ${p.companies.join(', ')}; dowody ${p.evidence_ids.join(', ') || '—'}; dlaczego nie wyróżnia: ${p.why_insufficient}`),
    '',
    `## Inne sposoby rozwiązania potrzeby (${data.alternative_routes.length})`,
    ...data.alternative_routes.map((r) => `- **${r.route}** (${r.status}): sens gdy ${r.when_sensible}; kompromis: ${r.tradeoff}`),
    '',
    `## Kandydaci na wyróżnik (${data.difference_candidates.length})`,
    ...data.difference_candidates.flatMap((d) => [
      `### ${d.candidate_id} · ${d.allowed_claim_strength}`,
      `- cecha: ${d.feature}`,
      `- korzyść: ${d.audience_value}`,
      `- porównanie: ${d.comparison}`,
      `- czego nie wiemy: ${d.unknown}`,
      `- dowody: ${d.proof_ids.join(', ') || '—'}; fakty: ${d.fact_ids.join(', ') || '—'}`,
      '',
    ]),
    `## Kanały i granice oceny (${data.channels.length})`,
    ...data.channels.map((ch) => `- **${ch.company}:** ${ch.visible_activity}; próbka: ${ch.sample}; metryki: ${ch.visible_metrics}; skuteczność: ${ch.business_effectiveness}; nie wiemy: ${ch.unknowns.join(', ')}`),
    '',
    `## Wnioski dla decyzji strategicznej (${data.implications.length})`,
    ...data.implications.map((i) => `- **${i.finding}** [${i.strategy_field}] — ograniczenie: ${i.limitation}${i.client_answer_needed ? `; pytanie do klienta: ${i.client_answer_needed}` : ''} (${i.evidence_ids.join(', ') || '—'})`),
    '',
    `## Luki i ograniczenia dokumentu (${issues.length})`,
    bullets(issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}

/** Client projection of WZR-KONKURENCJA: ≤ 3 companies in a table, ≤ 5 short cells each, and a ≤ 350-word summary. */
export function renderKonkurencjaClientView(args: { brand: string; data: KonkurencjaData; language: 'pl' | 'en' }): string {
  const { data } = args
  const pl = args.language === 'pl'
  const short = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text).replace(/\|/g, '/')
  const header = pl
    ? '| Firma | Wspólna potrzeba | Obietnica i mechanizm | Dowód i ograniczenie | Znaczenie dla wyboru |'
    : '| Company | Shared need | Promise and mechanism | Proof and limit | What it means for the choice |'
  const rows = data.cards.slice(0, 3).map((c) => {
    const sel = data.selection.find((s) => s.company === c.company)
    const meaning = data.implications.find((i) => i.finding.toLowerCase().includes(c.company.toLowerCase()))?.finding ?? (sel?.competition_type ?? '—')
    return `| ${c.company} | ${short(sel?.shared_problem_scope ?? c.problem.text)} | ${short(`${c.message.text} — ${c.mechanism.text}`)} | ${short(`${c.proof.text}; ${c.unknowns[0] ?? ''}`)} | ${short(meaning)} |`
  })
  const summaryItems = [
    ...data.parity_claims.map((p) => (pl ? `Wspólne dla kategorii: ${p.claim} — ${p.why_insufficient}` : `Common to the category: ${p.claim} — ${p.why_insufficient}`)),
    ...data.difference_candidates.map((d) => (pl ? `Możliwy wyróżnik: ${d.feature} — ${d.audience_value}; nie wiemy: ${d.unknown}` : `Possible differentiator: ${d.feature} — ${d.audience_value}; unknown: ${d.unknown}`)),
    ...data.implications.map((i) => i.finding),
  ]
  const budget = clientProjectionOf('WZR-KONKURENCJA').word_limit ?? 350
  const intro = pl ? `Porównanie ${args.brand} z ${data.cards.length} firmami z tej samej kategorii, na wspólnych kryteriach. Brak wzmianki u konkurenta nie jest dowodem wyłączności.` : `${args.brand} compared with ${data.cards.length} companies of the same category on common criteria. Absence at a competitor is not proof of exclusivity.`
  return [intro, '', header, '|---|---|---|---|---|', ...rows, '', pl ? '## Co z tego wynika' : '## What follows', bullets(trimToBudget(summaryItems, budget - 60)), ''].join('\n')
}
