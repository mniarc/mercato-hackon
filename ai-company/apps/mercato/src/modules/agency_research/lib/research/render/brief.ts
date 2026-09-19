import type { DocumentIssue } from '../../../data/schemas/envelope'
import type { BriefData } from '../../../data/schemas/brief'
import type { UstaleniaData } from '../../../data/schemas/ustalenia'
import { limits } from '../../../data/templates'
import { checkClientView, fitClientView, stripEvidenceIds, type ClientView } from '../clientView'
import { countClientWords } from '../util'

/**
 * KLI-BRIEF rendering. The client view follows WZR-BRIEF's projection: 500–700
 * words, the filled fields first, then at most 8 Must questions — a first contact
 * of real decisions, not ten form sections. The view never overwrites the data.
 */

const T = {
  pl: {
    title: 'Brief potrzeb i celów',
    offer: 'Co teraz promujemy',
    audience: 'Do kogo kierujemy komunikację',
    direction: 'Cel biznesowy i kierunek marki',
    promise: 'Co możemy wiarygodnie obiecać',
    notPromised: 'Czego nie obiecujemy',
    avoid: 'Czego unikamy',
    voice: 'Preferencje głosu',
    voiceExamples: 'Dwa równorzędne przykłady — który jest bliższy firmie?',
    channel: 'Kanał i następny krok',
    success: 'Miara powodzenia i ograniczenia',
    questions: 'Pytania do Ciebie',
    why: 'dlaczego',
    ourMaterial: 'naszym materiale z researchu',
    peopleList: 'spośród osób wypowiadających się w imieniu marki',
    hint: 'podpowiedź',
    proposal: 'propozycja do potwierdzenia',
    decided: 'potwierdzone',
    assumptions: 'Otwarte założenia',
    assets: 'Materiały i uprawnienia',
    buyerReality: 'Rzeczywiste sytuacje zakupowe',
    issues: 'Luki i ograniczenia',
    owner: 'Osoba odbierająca kontakt',
    unknown: 'nieznana — do ustalenia przed publikacją',
  },
  en: {
    title: 'Brief of needs and goals',
    offer: 'What we promote now',
    audience: 'Who we speak to',
    direction: 'Business goal and brand direction',
    promise: 'What we can credibly promise',
    notPromised: 'What we do not promise',
    avoid: 'What we avoid',
    voice: 'Voice preferences',
    voiceExamples: 'Two equally valid examples — which is closer to you?',
    channel: 'Channel and next step',
    success: 'Measure of success and limits',
    questions: 'Questions for you',
    why: 'why',
    ourMaterial: 'our research material',
    peopleList: 'among the people who speak for the brand',
    hint: 'hint',
    proposal: 'proposal to confirm',
    decided: 'confirmed',
    assumptions: 'Open assumptions',
    assets: 'Materials and permissions',
    buyerReality: 'Real buying situations',
    issues: 'Gaps and limitations',
    owner: 'Contact owner',
    unknown: 'unknown — to be named before publication',
  },
} as const

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- —'
}

function stateLabel(t: (typeof T)['pl'] | (typeof T)['en'], state: string): string {
  return state === 'client_selected' ? t.decided : t.proposal
}

/** The ≤ 8 questions of the first contact: Must first, then Should, open ones only. */
export function firstContactQuestions(ustalenia: UstaleniaData, max = limits.clientText.questionBatchMax): UstaleniaData['questions'] {
  const rank = { must: 0, should: 1, could: 2 } as const
  return ustalenia.questions
    .filter((q) => !/^resolved/.test(q.state))
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, max)
}

const FIELD_LABELS = {
  pl: { priority_offer: 'co teraz promujemy', priority_audience: 'do kogo kierujemy komunikację', business_direction: 'cel biznesowy i kierunek marki', buyer_reality: 'rzeczywiste sytuacje zakupowe', promise_constraints: 'co możemy wiarygodnie obiecać', voice_preferences: 'preferencje głosu', channel_and_cta: 'kanał i następny krok', success_and_limits: 'miara powodzenia i ograniczenia', assets_and_permissions: 'materiały i uprawnienia', open_assumptions: 'otwarte założenia' },
  en: { priority_offer: 'what we promote now', priority_audience: 'who we address', business_direction: 'business goal and brand direction', buyer_reality: 'real buying situations', promise_constraints: 'what we can credibly promise', voice_preferences: 'voice preferences', channel_and_cta: 'channel and next step', success_and_limits: 'measure of success and limits', assets_and_permissions: 'materials and permissions', open_assumptions: 'open assumptions' },
} as const

export function renderBriefClientView(args: { outputLanguage: 'pl' | 'en'; brand: string; data: BriefData; ustalenia: UstaleniaData }): ClientView {
  const { data, ustalenia } = args
  const t = T[args.outputLanguage]
  const sections: string[] = [
    `# ${t.title} — ${args.brand}`,
    '',
    `## ${t.offer} (${stateLabel(t, data.priority_offer.decision_state)})`,
    data.priority_offer.value,
    data.priority_offer.result_for_audience,
    '',
    `## ${t.audience} (${stateLabel(t, data.priority_audience.decision_state)})`,
    data.priority_audience.value,
    '',
    `## ${t.direction} (${stateLabel(t, data.business_direction.decision_state)})`,
    data.business_direction.value,
    data.business_direction.communication_role,
    '',
    `## ${t.promise}`,
    data.promise_constraints.capabilities,
    `**${t.notPromised}:** ${data.promise_constraints.prohibited_claims.join('; ')}`,
    '',
    `## ${t.voice} (${stateLabel(t, data.voice_preferences.decision_state)})`,
    ...data.voice_preferences.desired_traits.map((trait) => `- ${trait}`),
    ...(data.voice_preferences.unwanted_traits.length ? [`**${t.avoid}:** ${data.voice_preferences.unwanted_traits.join('; ')}`] : []),
    ...(data.voice_preferences.proposed_examples.length
      ? [`**${t.voiceExamples}**`, ...data.voice_preferences.proposed_examples.map((e) => `- **${e.label}:** ${e.text}`)]
      : []),
    '',
    `## ${t.channel} (${stateLabel(t, data.channel_and_cta.decision_state)})`,
    `${data.channel_and_cta.channel} — ${data.channel_and_cta.cta_goal}`,
    `**${t.owner}:** ${data.channel_and_cta.owner ?? t.unknown}`,
    '',
    `## ${t.success}`,
    data.success_and_limits.directional_goal,
    data.success_and_limits.scope_limit,
    '',
  ]
  // The questions ARE the first contact (Rafał: 6–8 Must questions), so they are reserved
  // first and the prose is fitted around them; evidence ids never reach the client.
  const questions = firstContactQuestions(ustalenia)
  const clientWords = (text: string) => stripEvidenceIds(text)
    .replace(/\b(priority_offer|priority_audience|business_direction|buyer_reality|promise_constraints|voice_preferences|channel_and_cta|success_and_limits|assets_and_permissions|open_assumptions)\b/g, (key) => `„${FIELD_LABELS[args.outputLanguage][key as keyof typeof FIELD_LABELS['pl']]}”`)
    .replace(/\b(buyer_map|offer_map|field_map|journey|proof_cards|language_samples)\b/g, t.ourMaterial)
    .replace(/\b(?:z listy |from the )?people\b/g, t.peopleList)
    .replace(/\s*\((?:gap|hypothesis|hipoteza|luka)\)/gi, '')
  const questionLines = questions.map((q, index) => `${index + 1}. **${clientWords(q.question)}** _(${t.hint}: ${clientWords(q.hint)})_`)
  const questionBlock = [`## ${t.questions}`, ...(questionLines.length ? questionLines : ['—'])]
  const budget = limits.clientText.briefWordsMax
  const bodyBudget = Math.max(200, budget - countClientWords(questionBlock.join('\n')))
  const fitted = fitClientView('WZR-BRIEF', sections.map((line) => clientWords(line)), args.outputLanguage, bodyBudget, { keepEveryLine: true })
  const markdown = `${fitted.markdown}\n${questionBlock.join('\n')}\n`
  const view = checkClientView('WZR-BRIEF', markdown)
  const issues: DocumentIssue[] = []
  if (view.issue) issues.push(view.issue)
  return { ...view, issue: issues[0] ?? null, markdown }
}

/** Internal markdown: every field with its decision state, ids and limits — for staff and QA. */
export function renderBrief(args: { outputLanguage: 'pl' | 'en'; brand: string; data: BriefData; issues: DocumentIssue[] }): string {
  const { data } = args
  const t = T[args.outputLanguage]
  return [
    `# KLI-BRIEF — ${args.brand}`,
    '',
    `## ${t.offer} · ${data.priority_offer.decision_state}`,
    data.priority_offer.value,
    `- ${data.priority_offer.result_for_audience}`,
    `- excluded: ${data.priority_offer.excluded_from_scope.join('; ') || '—'}`,
    `- facts: ${data.priority_offer.fact_ids.join(', ') || '—'}`,
    '',
    `## ${t.audience} · ${data.priority_audience.decision_state}`,
    data.priority_audience.value,
    `- segment: ${data.priority_audience.priority_choice.segment} · roles: ${data.priority_audience.priority_choice.target_role.join(', ')}`,
    ...data.priority_audience.buyer_claims.map((c) => `- ${c.component}: ${c.value ?? '—'} (${c.knowledge_status}, ${c.provenance}; ${c.evidence_ids.join(', ') || 'no evidence'})`),
    '',
    `## ${t.direction} · ${data.business_direction.decision_state}`,
    data.business_direction.value,
    `- ${data.business_direction.from_to}`,
    `- horizon: ${data.business_direction.horizon ?? '—'} · baseline: ${data.business_direction.baseline ?? '—'}`,
    `- ${t.notPromised}: ${data.business_direction.not_promised.join('; ') || '—'}`,
    '',
    `## ${t.buyerReality}`,
    bullets(data.buyer_reality.map((b) => `${b.situation} (${b.status}; ${b.relevant_fact_ids.join(', ') || '—'})`)),
    '',
    `## ${t.promise}`,
    `- capabilities: ${data.promise_constraints.capabilities}`,
    `- result limits: ${data.promise_constraints.result_limits}`,
    `- prohibited: ${data.promise_constraints.prohibited_claims.join('; ')}`,
    `- proofs: ${data.promise_constraints.allowed_proof_ids.join(', ') || '—'}`,
    ...data.promise_constraints.rights_by_proof.map((r) => `  - ${r.proof_id}: ${r.allowed_use}, name ${r.client_name_permission}, quote ${r.quote_permission}`),
    '',
    `## ${t.voice} · ${data.voice_preferences.decision_state}`,
    `- desired: ${data.voice_preferences.desired_traits.join(', ') || '—'}`,
    `- unwanted: ${data.voice_preferences.unwanted_traits.join(', ') || '—'}`,
    `- style: jargon ${data.voice_preferences.style_preferences.jargon ?? '—'} · humor ${data.voice_preferences.style_preferences.humor ?? '—'} · formalness ${data.voice_preferences.style_preferences.formalness ?? '—'}`,
    ...data.voice_preferences.proposed_examples.map((e) => `- **${e.variant_id} ${e.label}:** ${e.text} (${e.fact_ids.join(', ') || '—'})`),
    `- client_selection: ${data.voice_preferences.client_selection ?? 'null'}`,
    '',
    `## ${t.channel} · ${data.channel_and_cta.decision_state}`,
    `- ${data.channel_and_cta.channel}: ${data.channel_and_cta.cta_goal}`,
    `- cta_text: ${data.channel_and_cta.cta_text ?? '—'} · destination: ${data.channel_and_cta.destination ?? '—'} (${data.channel_and_cta.destination_visibility}, ${data.channel_and_cta.destination_functionality})`,
    `- owner: ${data.channel_and_cta.owner ?? '—'} · draft ${data.channel_and_cta.draft_readiness} · publication ${data.channel_and_cta.publication_readiness}`,
    `- limits: ${data.channel_and_cta.limits.join('; ') || '—'}`,
    '',
    `## ${t.success}`,
    `- ${data.success_and_limits.directional_goal}`,
    ...data.success_and_limits.measurement_proposals.map((m) => `- ${m.measure}: ${m.definition} (${m.status})`),
    `- baseline: ${data.success_and_limits.baseline ?? '—'} · target: ${data.success_and_limits.numerical_target ?? '—'}`,
    `- ${data.success_and_limits.scope_limit}`,
    '',
    `## ${t.assets}`,
    bullets(data.assets_and_permissions.map((a) => `${a.asset_id} ← ${a.source_ref}: ${a.allowed_use}, name ${a.client_name_permission}, quote ${a.quote_permission}; claims ${a.supported_claim_ids.join(', ') || '—'}`)),
    '',
    `## ${t.assumptions} (${data.open_assumptions.length})`,
    bullets(data.open_assumptions.map((a) => `**${a.assumption_id}** [${a.type}] ${a.text} → ${a.decision_owner}, ${a.logical_deadline}`)),
    '',
    `## ${t.issues} (${args.issues.length})`,
    bullets(args.issues.map((i) => `**${i.code}** (${i.severity}) ${i.detail}`)),
    '',
  ].join('\n')
}
