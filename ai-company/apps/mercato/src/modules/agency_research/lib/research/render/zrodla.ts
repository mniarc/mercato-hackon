import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { BusinessProfile, CoverageItem, ZrodlaData } from '../../../data/schemas/zrodla'

/**
 * Internal markdown for WEW-ZRODLA — the register is `internal_only` for the
 * client (WZR-ZRODLA client view), so this is for staff and for the next agents'
 * humans: every fact with its source and quote, every card with its limits.
 */

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

export function renderZrodla(args: { brand: string; data: ZrodlaData; businessProfile: BusinessProfile; issues: DocumentIssue[]; versionLabel: string }): string {
  const { data, businessProfile, issues } = args
  const sourceById = new Map(data.sources.map((s) => [s.source_id, s]))
  const capacity = data.coverage.find((c): c is Extract<CoverageItem, { item_type: 'plan_capacity' }> => c.item_type === 'plan_capacity')
  return [
    `# WEW-ZRODLA — ${args.brand} (v${args.versionLabel})`,
    '',
    '## Wstępny profil biznesowy (O-3.2)',
    `- **Kategoria:** ${businessProfile.category}`,
    `- **Oferta:** ${businessProfile.offer_summary}`,
    `- **Odbiorca (hipoteza):** ${businessProfile.audience_hint}`,
    `- **Rynek:** ${businessProfile.market_hint}`,
    `- **Fakty:** ${businessProfile.fact_ids.join(', ') || '—'}`,
    '',
    `## Źródła (${data.sources.length}; ${data.sources.filter((s) => s.access !== 'unavailable').length} przeczytane)`,
    '| id | dostęp | wydawca / rodzaj | adres | zakres |',
    '|---|---|---|---|---|',
    ...data.sources.map((s) => `| ${s.source_id} | ${s.access} | ${s.publisher} / ${s.kind} | ${s.url_or_file} | ${s.read_scope}${s.duplicate_of ? ` (duplikat ${s.duplicate_of})` : ''} |`),
    '',
    `## Fakty (${data.facts.length})`,
    ...data.facts.flatMap((f) => [
      `### ${f.fact_id} · ${f.kind}`,
      f.claim,
      '',
      `> ${f.locator.quote}`,
      `> — ${f.source_ids.map((id) => sourceById.get(id)?.url_or_file ?? id).join(', ')}`,
      f.limitation ? `_Ograniczenie: ${f.limitation}_` : '',
      '',
    ]),
    `## Karty dowodów (${data.proof_cards.length})`,
    ...data.proof_cards.flatMap((p) => [
      `### ${p.proof_id} · ${p.proof_type}`,
      `- **Problem:** ${p.problem ?? '—'}`,
      `- **Działanie:** ${p.actual_action ?? '—'}`,
      `- **Artefakt / metoda:** ${p.artifact_or_method ?? '—'}`,
      `- **Obserwowany wynik:** ${p.observed_result ?? '— (brak; nie obiecywać efektu)'}`,
      `- **Fakty:** ${p.fact_ids.join(', ')}`,
      `- **Ograniczenia:** ${p.limitations.join('; ') || '—'}`,
      `- **Uprawnienia:** nazwa klienta ${p.client_name_permission}, cytat ${p.quote_permission}, użycie ${p.allowed_use}`,
      '',
    ]),
    `## Próbka języka (${data.language_samples.length} fragmentów, ${new Set(data.language_samples.map((s) => s.independent_material_id)).size} materiałów)`,
    ...data.language_samples.flatMap((s) => [`> ${s.excerpt_or_paraphrase}`, `> — ${s.sample_id} · ${s.channel} · ${s.source_id} · ${s.linguistic_features.join(', ')}`, '']),
    `## Sygnały odbiorców (${data.audience_signals.length})`,
    ...data.audience_signals.map((a) => `- **${a.signal_id}** ${a.role_or_organization}: ${a.problem} (${a.evidence_status}; fakty ${a.fact_ids.join(', ') || '—'})`),
    '',
    `## Bank tematów (${data.content_bank.length}; gotowe ${data.content_bank.filter((s) => s.readiness === 'ready').length})`,
    ...data.content_bank.flatMap((t) => [
      `### ${t.seed_id} · ${t.angle} · ${t.readiness}`,
      `- **Pytanie odbiorcy:** ${t.audience_question}`,
      `- **Teza z dowodem:** ${t.source_claim.text} (${t.source_claim.fact_ids.join(', ') || 'brak faktu'})`,
      `- **Propozycja użyteczności (autorska):** ${t.proposed_utility.text}`,
      `- **Czego nie obiecywać:** ${t.prohibited_claims.join('; ') || '—'}`,
      t.reuse_of_evidence.note ? `- _${t.reuse_of_evidence.note}_` : '',
      '',
    ]),
    `## Sprzeczności (${data.conflicts.length})`,
    ...data.conflicts.map((x) => `- **${x.conflict_id}** [${x.facts.join(', ')}] ${x.detail} → ${x.question} (${x.state})`),
    '',
    '## Pokrycie potrzeb kolejnych dokumentów',
    '| potrzeba | gotowość | dowody | luka | właściciel |',
    '|---|---|---|---|---|',
    ...data.coverage
      .filter((c): c is Extract<CoverageItem, { item_type: 'requirement_coverage' }> => c.item_type === 'requirement_coverage')
      .map((c) => `| ${c.requirement} | ${c.readiness} | ${c.evidence_ids.join(', ') || '—'} | ${c.gap ?? '—'} | ${c.owner} |`),
    '',
    capacity
      ? `**Pojemność planu (Q-FREEZE):** ${capacity.ready_count} gotowych z ${capacity.required_topics} wymaganych odrębnych ujęć (${capacity.distinct_count} odrębnych, ${capacity.unsupported_angles.length} bez dowodu) → ${capacity.readiness}`
      : '',
    '',
    `## Luki i ograniczenia (${issues.length})`,
    bullets(issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}

export function renderSummary(args: { stats: { pages: number; chunks: number; agentCalls: number; cachedSteps: number; dropped: number; rejected: number }; data: ZrodlaData }): string {
  const { stats, data } = args
  return [
    `Pages: ${stats.pages} · Chunks: ${stats.chunks} · Agent calls: ${stats.agentCalls} · Cached: ${stats.cachedSteps}`,
    `Register: ${data.sources.length} sources, ${data.facts.length} facts, ${data.proof_cards.length} proof cards, ${data.language_samples.length} samples, ${data.audience_signals.length} signals, ${data.content_bank.length} seeds, ${data.conflicts.length} conflicts`,
    `Gate: ${stats.dropped} ungrounded items dropped · ${stats.rejected} sections rejected and re-requested`,
  ].join('\n')
}
