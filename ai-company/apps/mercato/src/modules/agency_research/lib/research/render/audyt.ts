import type { AudytData } from '../../../data/schemas/audyt'
import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { ZrodlaData } from '../../../data/schemas/zrodla'
import { limits } from '../../../data/templates'
import { trimToBudget } from '../clientView'

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

export function renderAudyt(args: { brand: string; data: AudytData; issues: DocumentIssue[]; versionLabel: string }): string {
  const { data, issues } = args
  const v = data.voice_audit
  const dim = (label: string, d: { finding: string; sample_ids: string[]; interpretation_limit: string | null }) =>
    `- **${label}:** ${d.finding} (${d.sample_ids.join(', ') || 'próbka niewystarczająca'})${d.interpretation_limit ? ` — _${d.interpretation_limit}_` : ''}`
  return [
    `# WEW-AUDYT — ${args.brand} (v${args.versionLabel})`,
    '',
    `## Mapa faktycznej oferty (${data.offer_map.length})`,
    ...data.offer_map.map((o) => `- **${o.service}** — dla: ${o.described_audience}; problem: ${o.problem}; rezultat: ${o.result}; mechanizm: ${o.mechanism}; granice: ${o.limits} (${o.fact_ids.join(', ')})`),
    '',
    `## Osoby i sytuacje zakupowe (${data.buyer_map.length})`,
    ...data.buyer_map.flatMap((b) => [
      `### ${b.scenario_id} · ${b.status}${b.direct_customer_voice ? ' · głos klienta' : ' · interpretacja'}`,
      `- inicjator: ${b.initiator}; użytkownik: ${b.user}; decydent: ${b.decision_maker}`,
      `- moment zakupu: ${b.purchase_moment}; zadanie: ${b.job}`,
      `- obiekcje: ${b.objections.join('; ') || '—'}; kryteria wyboru: ${b.selection_criteria ?? `unknown (${b.selection_criteria_status})`}`,
      `- fakty: ${b.fact_ids.join(', ') || '—'}`,
      '',
    ]),
    `## Obecna obietnica i uzasadnienie (${data.message_map.length})`,
    ...data.message_map.map((m) => `- **${m.message}** [${m.category}] → ${m.audience}: korzyść ${m.benefit}; mechanizm ${m.mechanism}; dowód ${m.proof_ids.join(', ') || 'brak'}; ryzyko: ${m.risk} (${m.fact_ids.join(', ')})`),
    '',
    '## Jak firma mówi obecnie',
    `_Próbka: ${v.sample_size}_`,
    dim('Formalność', v.formality),
    dim('Bezpośredniość', v.directness),
    dim('Poziom techniczny', v.technical_level),
    dim('Emocje', v.emotion),
    dim('Pewność tez', v.claim_certainty),
    dim('Powtarzalne zwroty', v.recurring_phrases),
    dim('Różnice między kanałami', v.channel_difference),
    `- **Przyszły głos:** ${v.future_voice_status}`,
    '',
    `## Droga od zainteresowania do kontaktu (${data.journey.length})`,
    ...data.journey.map((j) => `- **${j.stage}** · ${j.material}: obietnica ${j.promise}; CTA ${j.cta} → ${j.destination_status}; tarcie: ${j.friction ?? `nieustalone (${j.friction_status})`}; możliwa poprawa: ${j.possible_improvement} (${j.fact_ids.join(', ')})`),
    '',
    `## Relacje (${data.relationship.length})`,
    ...data.relationship.map((r) => `- **${r.area}:** ${r.finding} (${r.status}; ${r.fact_ids.join(', ') || 'brak danych'})`),
    '',
    `## Luki i priorytety (${data.gaps.length})`,
    ...data.gaps.flatMap((g) => [
      `### ${g.gap_id} · ${g.priority} · ${g.finding_type}`,
      g.observation,
      `- wpływ (hipoteza): ${g.business_impact_hypothesis ?? '— (nie zmierzono)'}`,
      `- potrzebne: ${g.needed} → ${g.destination}`,
      `- konsekwencja dla pracy: ${g.consequence_for_work}`,
      `- dowody: ${g.evidence_ids.join(', ') || '—'}`,
      '',
    ]),
    `## Zasoby do ponownego użycia (${data.reusable_assets.length})`,
    ...data.reusable_assets.map((a) => `- **${a.asset}** — ${a.value_for_audience}; dowody ${a.proof_ids.join(', ') || '—'}; tematy ${a.seed_ids.join(', ') || '—'}; dostępność: ${a.availability}; granica: ${a.limit}`),
    '',
    `## Luki i ograniczenia dokumentu (${issues.length})`,
    bullets(issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}

/**
 * Client projection of WZR-AUDYT: ≤ 450 words — 3 strengths, 3 problems with their
 * consequence, a short source note per conclusion, no cards, no technical ids.
 */
export function renderAudytClientView(args: { brand: string; data: AudytData; zrodla: ZrodlaData; language: 'pl' | 'en' }): string {
  const { data, zrodla } = args
  const pl = args.language === 'pl'
  const sourceNote = (ids: string[]) => {
    const urls = [...new Set(ids.flatMap((id) => zrodla.facts.find((f) => f.fact_id === id)?.source_ids ?? []).map((sid) => zrodla.sources.find((s) => s.source_id === sid)?.url_or_file).filter((u): u is string => Boolean(u)))]
    return urls.length ? ` (${pl ? 'źródło' : 'source'}: ${urls.slice(0, 2).map((u) => u.replace(/^https?:\/\/(www\.)?/, '').split('/').slice(0, 2).join('/')).join(', ')})` : ''
  }
  const strengths = [
    ...data.reusable_assets.map((a) => `**${a.asset}** — ${a.value_for_audience}${sourceNote(a.proof_ids.flatMap((p) => zrodla.proof_cards.find((c) => c.proof_id === p)?.fact_ids ?? []))}`),
    ...data.message_map.filter((m) => m.proof_ids.length > 0).map((m) => `**${m.message}** — ${m.benefit}${sourceNote(m.fact_ids)}`),
  ]
  const problems = data.gaps.map((g) => `**${g.observation}** — ${g.consequence_for_work}${sourceNote(g.evidence_ids)}`)
  const budget = limits.clientText.auditSummaryWordsMax
  const intro = pl
    ? `Podsumowanie audytu obecnej komunikacji ${args.brand}: co działa, co blokuje dalszą pracę i jakie decyzje są potrzebne.`
    : `Summary of the audit of ${args.brand}'s current communication: what works, what blocks the next steps and which decisions are needed.`
  const headStrong = pl ? '## Trzy mocne strony' : '## Three strengths'
  const headProblems = pl ? '## Trzy problemy i ich konsekwencje' : '## Three problems and their consequences'
  const headVoice = pl ? '## Jak firma mówi dziś' : '## How the company speaks today'
  const voice = `${data.voice_audit.formality.finding} ${data.voice_audit.claim_certainty.finding}`
  const pickedStrengths = trimToBudget(strengths, Math.floor(budget * 0.4)).slice(0, 3)
  const pickedProblems = trimToBudget(problems, Math.floor(budget * 0.4)).slice(0, 3)
  return [intro, '', headStrong, bullets(pickedStrengths), '', headProblems, bullets(pickedProblems), '', headVoice, voice, ''].join('\n')
}
