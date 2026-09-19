import type { DocumentIssue, InputVersion } from '../../../data/schemas/envelope'
import type { OrderFacts } from '../../../data/schemas/zamowienie'
import { briefDataSchema, type BriefData } from '../../../data/schemas/brief'
import { planDataSchema, type PlanData, type PlanTopic } from '../../../data/schemas/plan'
import { strategiaDataSchema, type StrategiaData } from '../../../data/schemas/strategia'
import { zrodlaDataSchema, type ZrodlaData } from '../../../data/schemas/zrodla'
import { completionCategories, zleceniePostuDataSchema, type ZleceniePostuData } from '../../../data/schemas/zleceniePostu'
import { adapterFor } from '../../../data/adapters'
import { limits } from '../../../data/templates'
import { currentInputVersion, finishTaskRun, saveDocumentVersion, startTaskRun } from '../../store'
import { renderZleceniePostu } from '../render/zleceniePostu'
import { simulationIssue } from '../simulation'
import type { StepContext, StepOutcome } from './context'
import { parseDownstreamTov, tovForbiddenWording, tovInstructionRules, tovShortPattern, type DownstreamTov } from './tovInput'

/**
 * Step 6.7 — WEW-ZLECENIE-POSTU, compiled without a model. The selected topic
 * is copied from the plan; every claim, fact, proof and seed it cites becomes an
 * evidence card carrying the TEXT (an isolated author cannot follow an id or a
 * URL); rights travel with the proof cards; the voice extract is at most five
 * rules from KLI-TOV; delivery constraints come from the order, the brief's CTA
 * and the versioned adapter catalog (an unknown limit is `unknown`, never a
 * remembered number); the completion list covers the seven required categories.
 * Nothing new is decided here: a missing selection blocks the instruction.
 */

type Evidence = ZleceniePostuData['evidence_payload'][number]
type Rights = Evidence['rights_and_limits']

export type PostInstructionInput = {
  order: OrderFacts
  outputLanguage: 'pl' | 'en'
  plan: PlanData
  planVersion: InputVersion
  strategia: StrategiaData
  tov: DownstreamTov
  tovVersion: InputVersion
  brief: BriefData
  zrodla: ZrodlaData
}

export type PostInstructionResult = { data: ZleceniePostuData; issues: DocumentIssue[] }

const T = {
  pl: {
    task: (brand: string, topic: PlanTopic) =>
      `Napisz jeden post tekstowy w głosie firmy ${brand}. Odpowiedz na pytanie odbiorcy: „${topic.audience_question}”. Przekaż jedną myśl: ${topic.main_message} Wykorzystaj ujęcie „${topic.angle.tool}” jako propozycję dla czytelnika, nie jako oficjalną metodę firmy. Zakończ jednym CTA zgodnym z instrukcją. Nie dodawaj faktów spoza evidence_payload.`,
    angle: (topic: PlanTopic) => `${topic.angle.tool}: ${topic.angle.steps.join(' · ')} (${topic.angle.status}).`,
    readerType: 'mini_checklist' as const,
    readerStatus: (seed: string) => `creative_proposal — autorska użyteczność z ${seed}, nie obserwowany artefakt firmy`,
    readerUsage: 'Przedstaw jako propozycję dla czytelnika („na początek proponujemy…”); odbiorca ma móc z tego skorzystać bez kontaktu. Nie zapowiadaj PDF-a, warsztatu, bezpłatnej analizy ani terminu.',
    readerExample: (example: string | null) => (example ? `Dopuszczalny jeden hipotetyczny przykład, oznaczony w tekście jako hipotetyczny: ${example}` : null),
    permittedCopyFact: 'Wolno sparafrazować w głosie firmy; nie zamieniać deklaracji w obietnicę wyniku.',
    permittedCopyProof: 'Wolno opisać artefakt lub metodę; wynik tylko w brzmieniu karty dowodu.',
    permittedCopySeed: 'Propozycja twórcza: wolno rozwinąć jako własną użyteczność; nie przypisywać firmie jako istniejącego produktu.',
    limitationNoResult: 'Deklaracja bez zmierzonego wyniku.',
    sourceReadScope: 'Odczyt z zamrożonego rejestru; strony nie otwierano ponownie.',
    wordCountRule: 'Słowa liczone rozdzieleniem po białych znakach; URL to jedno słowo.',
    linkPurpose: 'Istniejące miejsce kontaktu z briefu',
    websitePurpose: 'Strona firmy z zamówienia',
    shortPattern: (pattern: string) => `${pattern} — wzór kreatywny, nie fakt badawczy.`,
    completion: {
      editorial: (topic: PlanTopic) => `Redakcyjnie: hook z pytania odbiorcy, krótkie rozwinięcie, ${topic.angle.tool} jako użyteczność, jedno CTA. Nie rozbudowuj użyteczności do obietnicy nowej usługi.`,
      factual: (ids: string[]) => `Faktograficznie: każdy opis firmy i świata ma wpis w claims_map z odwołaniem do dopuszczonych dowodów (${ids.join(', ')}); checklista i przykład oznaczone jako creative_example. Liczby, efekty i wyłączność bez dowodu — usuń.`,
      format: (min: number, max: number, limit: string) => `Format: ${min}–${max} słów; policz słowa i znaki. Limit platformy: ${limit}. Bez grafiki, karuzeli, wideo i nowych URL.`,
      no_network: 'Bez sieci: nie otwieraj stron ani nie szukaj nowych źródeł. Jeśli brakuje faktu, zawęź lub pomiń twierdzenie; gdy to niemożliwe, zgłoś konkretne pole kompilatorowi.',
      allowed_documents: (tov: string) => `Dozwolone dokumenty: wyłącznie WEW-ZLECENIE-POSTU i ${tov}. Fakty z przykładów językowych ToV nie są dowodami.`,
      missing_data_action: 'Brak danych: nazwij pole, lukę i konsekwencję w evidence_limitations; nie uzupełniaj wiedzą własną.',
      independent_reviewer: 'Samoocena według pytań copy_checks to propozycja (author_self_check); osobny redaktor wykonuje niezależne QA. approval_records zostają puste — bez akceptacji, zlecenia publikacji i dowodu wysyłki.',
    },
  },
  en: {
    task: (brand: string, topic: PlanTopic) =>
      `Write one text post in the voice of ${brand}. Answer the audience question: "${topic.audience_question}". Carry one message: ${topic.main_message} Use the angle "${topic.angle.tool}" as a proposal for the reader, never as the company's official method. Close with one CTA per the instruction. Add no facts beyond evidence_payload.`,
    angle: (topic: PlanTopic) => `${topic.angle.tool}: ${topic.angle.steps.join(' · ')} (${topic.angle.status}).`,
    readerType: 'mini_checklist' as const,
    readerStatus: (seed: string) => `creative_proposal — authored utility from ${seed}, not an observed company artifact`,
    readerUsage: 'Present it as a proposal for the reader ("to start, we suggest…"); the reader must be able to use it without contacting anyone. Do not announce a PDF, workshop, free analysis or a date.',
    readerExample: (example: string | null) => (example ? `One hypothetical example allowed, marked as hypothetical in the text: ${example}` : null),
    permittedCopyFact: 'May be paraphrased in the company voice; a declaration never becomes a promised result.',
    permittedCopyProof: 'The artifact or method may be described; a result only as the proof card words it.',
    permittedCopySeed: 'Creative proposal: may be developed as an authored utility; never attributed to the company as an existing product.',
    limitationNoResult: 'A declaration without a measured result.',
    sourceReadScope: 'Read from the frozen register; the page was not reopened.',
    wordCountRule: 'Words are whitespace-separated tokens; a URL is one word.',
    linkPurpose: 'Existing contact destination from the brief',
    websitePurpose: 'Company website from the order',
    shortPattern: (pattern: string) => `${pattern} — a creative pattern, not a research fact.`,
    completion: {
      editorial: (topic: PlanTopic) => `Editorial: a hook from the audience question, a short development, ${topic.angle.tool} as the utility, one CTA. Do not grow the utility into a promise of a new service.`,
      factual: (ids: string[]) => `Factual: every description of the company or the world has a claims_map row pointing at the allowed evidence (${ids.join(', ')}); the checklist and any example are marked creative_example. Numbers, effects and uniqueness without proof — remove.`,
      format: (min: number, max: number, limit: string) => `Format: ${min}–${max} words; count words and characters. Platform limit: ${limit}. No image, carousel, video or new URL.`,
      no_network: 'No network: open no page and seek no new source. When a fact is missing, narrow or drop the claim; when impossible, report the exact field to the compiler.',
      allowed_documents: (tov: string) => `Allowed documents: only WEW-ZLECENIE-POSTU and ${tov}. Facts inside ToV language examples are not evidence.`,
      missing_data_action: 'Missing data: name the field, the gap and the consequence in evidence_limitations; never fill from own knowledge.',
      independent_reviewer: 'The self-check against copy_checks is a proposal (author_self_check); a separate editor performs independent QA. approval_records stay empty — no approval, publication order or proof of sending.',
    },
  },
} as const

const rightsOf = (card: ZrodlaData['proof_cards'][number] | undefined, source: ZrodlaData['sources'][number] | undefined): Rights => ({
  source_visibility: card?.source_visibility ?? source?.source_visibility ?? 'unknown',
  allowed_use: card?.allowed_use ?? 'internal_only',
  use_basis_ref: card?.use_basis_ref ? [card.use_basis_ref] : [],
  client_name_permission: card?.client_name_permission ?? 'unknown',
  quote_permission: card?.quote_permission ?? 'unknown',
  publication_approval: 'missing',
})

/** Pure compilation of the instruction from the pinned documents; every gap is an issue, never an invention. */
export function assemblePostInstruction(input: PostInstructionInput): PostInstructionResult {
  const { order, plan, strategia, tov, brief, zrodla, outputLanguage } = input
  const t = T[outputLanguage]
  const issues: DocumentIssue[] = []
  const selectedId = plan.selected_topic.topic_id
  const topic = plan.topics.find((item) => item.topic_id === selectedId)
  if (!selectedId || !topic) throw new Error('[internal] 6.7 needs a selected topic in the current KLI-PLAN version — run 6.5 first')

  const factById = new Map(zrodla.facts.map((fact) => [fact.fact_id, fact]))
  const proofById = new Map(zrodla.proof_cards.map((card) => [card.proof_id, card]))
  const seedById = new Map(zrodla.content_bank.map((seed) => [seed.seed_id, seed]))
  const sourceById = new Map(zrodla.sources.map((source) => [source.source_id, source]))
  const claimById = new Map(strategia.proof_architecture.map((claim) => [claim.claim_id, claim]))
  const sourcePayload = (ids: string[]) =>
    ids
      .map((id) => sourceById.get(id))
      .filter((source): source is NonNullable<typeof source> => source !== undefined)
      .map((source) => ({ source_id: source.source_id, publisher: source.publisher, title: source.title, url: source.url_or_file, access: source.access, read_scope: t.sourceReadScope }))
  const proofBackingFact = (factId: string) => zrodla.proof_cards.find((card) => card.fact_ids.includes(factId))

  const cards: Evidence[] = []
  for (const claimId of topic.claim_ids) {
    const claim = claimById.get(claimId)
    if (!claim) {
      issues.push({ code: 'UNKNOWN_ID', severity: 'limitation', detail: `${claimId} is not a strategy claim; no evidence card`, path: 'evidence_payload' })
      continue
    }
    const facts = claim.fact_ids.map((id) => factById.get(id)).filter((fact): fact is NonNullable<typeof fact> => fact !== undefined)
    const proofs = claim.proof_ids.map((id) => proofById.get(id)).filter((card): card is NonNullable<typeof card> => card !== undefined)
    const text = [claim.allowed_claim, ...facts.map((fact) => fact.claim)].join(' ')
    cards.push({
      claim_id: claim.claim_id,
      kind: 'source_claim',
      text,
      fact_id: facts[0]?.fact_id ?? null,
      seed_id: null,
      fact_ids: facts.map((fact) => fact.fact_id),
      source_ids: [...new Set([...claim.source_ids, ...facts.flatMap((fact) => fact.source_ids)])],
      source_payload: sourcePayload([...new Set([...claim.source_ids, ...facts.flatMap((fact) => fact.source_ids)])]),
      limitations: [...claim.limitations, claim.forbidden_claim, ...facts.map((fact) => fact.limitation).filter((limit): limit is string => Boolean(limit))],
      permitted_copy: proofs.length ? t.permittedCopyProof : t.permittedCopyFact,
      provenance: facts.length ? 'observed' : 'inferred',
      reuse_of_evidence: null,
      is_new_independent_source: false,
      rights_and_limits: rightsOf(proofs[0] ?? proofBackingFact(facts[0]?.fact_id ?? ''), sourceById.get(facts[0]?.source_ids[0] ?? '')),
    })
  }
  const covered = new Set(cards.flatMap((card) => card.fact_ids))
  for (const factId of topic.fact_ids) {
    if (covered.has(factId)) continue
    const fact = factById.get(factId)
    if (!fact) {
      issues.push({ code: 'UNKNOWN_ID', severity: 'limitation', detail: `${factId} is not a stored fact; no evidence card`, path: 'evidence_payload' })
      continue
    }
    const proof = proofBackingFact(factId)
    cards.push({
      claim_id: `CL-${factId}`,
      kind: 'source_claim',
      text: fact.claim,
      fact_id: fact.fact_id,
      seed_id: null,
      fact_ids: [fact.fact_id],
      source_ids: fact.source_ids,
      source_payload: sourcePayload(fact.source_ids),
      limitations: [fact.limitation ?? t.limitationNoResult],
      permitted_copy: t.permittedCopyFact,
      provenance: 'observed',
      reuse_of_evidence: null,
      is_new_independent_source: false,
      rights_and_limits: rightsOf(proof, sourceById.get(fact.source_ids[0])),
    })
    covered.add(factId)
  }
  for (const proofId of topic.proof_ids) {
    const card = proofById.get(proofId)
    if (!card) {
      issues.push({ code: 'UNKNOWN_ID', severity: 'limitation', detail: `${proofId} is not a stored proof card; no evidence card`, path: 'evidence_payload' })
      continue
    }
    if (cards.some((existing) => existing.fact_ids.some((id) => card.fact_ids.includes(id)) && existing.text.includes(card.artifact_or_method ?? '\u0000'))) continue
    const text = [card.artifact_or_method, card.observed_result].filter((part): part is string => Boolean(part)).join(' — ')
    if (!text) continue
    cards.push({
      claim_id: `CL-${proofId}`,
      kind: 'source_claim',
      text,
      fact_id: card.fact_ids[0] ?? null,
      seed_id: null,
      fact_ids: card.fact_ids,
      source_ids: card.source_ids,
      source_payload: sourcePayload(card.source_ids),
      limitations: card.limitations.length ? card.limitations : [t.limitationNoResult],
      permitted_copy: t.permittedCopyProof,
      provenance: card.provenance,
      reuse_of_evidence: null,
      is_new_independent_source: false,
      rights_and_limits: rightsOf(card, sourceById.get(card.source_ids[0])),
    })
  }
  const seeds = topic.seed_ids.map((id) => seedById.get(id)).filter((seed): seed is NonNullable<typeof seed> => seed !== undefined)
  for (const seedId of topic.seed_ids) if (!seedById.has(seedId)) issues.push({ code: 'UNKNOWN_ID', severity: 'limitation', detail: `${seedId} is not a stored seed`, path: 'evidence_payload' })
  for (const seed of seeds) {
    cards.push({
      claim_id: `CR-${seed.seed_id}`,
      kind: 'creative_proposal',
      text: `${seed.proposed_utility.text} ${seed.source_claim.text}`,
      fact_id: seed.source_claim.fact_ids[0] ?? null,
      seed_id: seed.seed_id,
      fact_ids: [...new Set([...seed.source_claim.fact_ids, ...seed.fact_ids])],
      source_ids: seed.source_claim.source_ids,
      source_payload: sourcePayload(seed.source_claim.source_ids),
      limitations: seed.prohibited_claims,
      permitted_copy: t.permittedCopySeed,
      provenance: 'creative_proposal',
      reuse_of_evidence: seed.reuse_of_evidence.note ?? (seed.reuse_of_evidence.shared_fact_ids.length ? `shared facts: ${seed.reuse_of_evidence.shared_fact_ids.join(', ')}` : null),
      is_new_independent_source: false,
      rights_and_limits: rightsOf(proofById.get(seed.proof_ids[0] ?? ''), sourceById.get(seed.source_claim.source_ids[0] ?? '')),
    })
  }
  if (!cards.length) issues.push({ code: 'NO_EVIDENCE', severity: 'blocking', detail: 'the selected topic resolves to no evidence card; the author would have nothing to write from', path: 'evidence_payload' })

  const primarySeed = seeds[0] ?? null
  const readerItems = topic.angle.steps.length ? topic.angle.steps : primarySeed ? [primarySeed.proposed_utility.text] : [topic.main_message]
  const reader: ZleceniePostuData['reader_value'] = {
    type: t.readerType,
    title: topic.angle.tool,
    items: readerItems,
    status: t.readerStatus(primarySeed?.seed_id ?? topic.topic_id),
    usage: t.readerUsage,
    example_option: t.readerExample(topic.angle.example?.text ?? null),
  }

  const rules = tovInstructionRules(tov).filter((rule) => rule.trim().length > 0).slice(0, limits.content.voiceExtractRulesMax)
  const shortPattern = tovShortPattern(tov)
  const voice: ZleceniePostuData['voice_extract'] = {
    tov_id: input.tovVersion.document_id,
    tov_version: input.tovVersion.version,
    rules,
    forbidden_cliches: tovForbiddenWording(tov),
    short_pattern: t.shortPattern(shortPattern),
  }

  const adapter = adapterFor(order.officialSocialPlatform)
  if (!adapter) issues.push({ code: 'ADAPTER_UNKNOWN', severity: 'limitation', detail: `no adapter for platform "${order.officialSocialPlatform ?? '—'}"; the platform limit is unknown and final format QA stays blocked`, path: 'delivery_constraints.max_text_length' })
  const cta = brief.channel_and_cta
  const links: ZleceniePostuData['delivery_constraints']['links'] = []
  if (cta.destination) links.push({ url: cta.destination, purpose: t.linkPurpose, owner: cta.owner, visibility_status: cta.destination_visibility, operational_status: 'not_checked', contact_owner: cta.owner })
  if (!links.some((link) => link.url === order.websiteUrl)) links.push({ url: order.websiteUrl, purpose: t.websitePurpose, owner: order.brand, visibility_status: 'observed', operational_status: 'not_checked', contact_owner: cta.owner })
  const prohibited = [...new Set([...strategia.creative_boundaries.prohibited_promises, ...brief.promise_constraints.prohibited_claims, ...topic.evidence_limits.split('\n').filter((line) => line.trim().length > 0)])]
  const delivery: ZleceniePostuData['delivery_constraints'] = {
    channel: plan.plan_context.channel,
    language: order.language,
    market: order.market,
    format: 'text',
    adapter_id: adapter?.adapter_id ?? null,
    adapter_version: adapter?.adapter_version ?? null,
    max_text_length: adapter?.max_text_length ?? null,
    length_unit: adapter?.length_unit ?? null,
    platform_limit_status: adapter ? 'known' : 'unknown',
    product_length_target: { words: limits.clientText.postWordsTarget, word_count_rule: t.wordCountRule },
    links,
    mentions: [],
    cta: cta.cta_text ?? topic.cta,
    cta_destination: cta.destination,
    cta_draft_readiness: cta.draft_readiness,
    cta_publication_readiness: cta.publication_readiness,
    prohibited_claims: prohibited,
    finished_post_count: limits.content.finishedPosts,
  }
  const allowedIds = cards.map((card) => card.claim_id)
  const limitLabel = adapter ? `${adapter.max_text_length} ${adapter.length_unit} (${adapter.adapter_id}@${adapter.adapter_version})` : 'unknown'
  const completion = completionCategories.map((category) => {
    switch (category) {
      case 'editorial':
        return t.completion.editorial(topic)
      case 'factual':
        return t.completion.factual(allowedIds)
      case 'format':
        return t.completion.format(limits.clientText.postWordsTarget[0], limits.clientText.postWordsTarget[1], limitLabel)
      case 'no_network':
        return t.completion.no_network
      case 'allowed_documents':
        return t.completion.allowed_documents(`${voice.tov_id} v${voice.tov_version}`)
      case 'missing_data_action':
        return t.completion.missing_data_action
      case 'independent_reviewer':
        return t.completion.independent_reviewer
    }
  })

  const data: ZleceniePostuData = {
    selected_item: {
      topic_id: topic.topic_id,
      seed_id: primarySeed?.seed_id ?? null,
      plan_id: input.planVersion.document_id,
      plan_version: input.planVersion.version,
      selection_status: plan.selected_topic.status,
      decision_id: plan.selected_topic.decision_id,
      audience: plan.plan_context.audience,
      audience_question: topic.audience_question,
      goal: topic.post_goal,
      main_message: topic.main_message,
      angle: t.angle(topic),
      task: t.task(order.brand, topic),
    },
    evidence_payload: cards,
    reader_value: reader,
    voice_extract: voice,
    delivery_constraints: delivery,
    completion,
  }
  return { data: zleceniePostuDataSchema.parse(data), issues }
}

const pin = (v: InputVersion & { versionId: string }): InputVersion => ({
  document_id: v.document_id, version: v.version, status: v.status,
  ...(v.specialistTov ? { specialistTov: v.specialistTov } : {}),
})

/** The instruction's inputs per the WZR-ZLECENIE-POSTU handoff: the plan with its selection, strategy, ToV, brief and the frozen register. */
export async function runPostInstructionStep(ctx: StepContext): Promise<StepOutcome> {
  const plan = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-PLAN')
  const strategia = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-STRATEGIA')
  const tov = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-TOV')
  const brief = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-BRIEF')
  const zrodla = await currentInputVersion(ctx.em, ctx.scope, ctx.orderRef, 'WZR-ZRODLA')
  if (!plan || !strategia || !tov || !brief || !zrodla) throw new Error('[internal] 6.7 needs current KLI-PLAN, KLI-STRATEGIA, KLI-TOV, KLI-BRIEF and WEW-ZRODLA versions')
  const inputVersions: InputVersion[] = [ctx.orderVersion, pin(plan), pin(strategia), pin(tov), pin(brief), pin(zrodla)]
  const simulation = simulationIssue(inputVersions)
  const run = await startTaskRun(ctx.em, ctx.scope, { orderRef: ctx.orderRef, brand: ctx.order.brand, stepId: '6.7', attempt: ctx.attempt, runner: ctx.runner, models: {}, inputVersions })
  ctx.taskRunIds.push(run.id)
  try {
    const result = assemblePostInstruction({
      order: ctx.order,
      outputLanguage: ctx.order.outputLanguage,
      plan: planDataSchema.parse(plan.data),
      planVersion: pin(plan),
      strategia: strategiaDataSchema.parse(strategia.data),
      tov: parseDownstreamTov(tov),
      tovVersion: pin(tov),
      brief: briefDataSchema.parse(brief.data),
      zrodla: zrodlaDataSchema.parse(zrodla.data),
    })
    const issues = simulation ? [...result.issues, simulation] : result.issues
    const blocked = issues.some((issue) => issue.severity === 'blocking')
    const saved = await saveDocumentVersion(ctx.em, ctx.scope, {
      orderRef: ctx.orderRef,
      brand: ctx.order.brand,
      templateId: 'WZR-ZLECENIE-POSTU',
      status: blocked ? 'blocked' : 'ready_for_review',
      inputVersions,
      data: result.data as unknown as Record<string, unknown>,
      issues,
      renderedMd: renderZleceniePostu({ outputLanguage: ctx.order.outputLanguage, brand: ctx.order.brand, data: result.data, issues }),
      taskRunId: run.id,
      simulation: simulation !== null,
    })
    ctx.documentVersionIds.push(saved.version.id)
    await finishTaskRun(ctx.em, run, { status: 'done', outputVersionId: saved.version.id, summary: { evidenceCards: result.data.evidence_payload.length, adapter: result.data.delivery_constraints.adapter_id }, cost: ctx.ledger.snapshot() })
    return { taskRunId: run.id, versionId: saved.version.id, status: 'done' }
  } catch (error) {
    await finishTaskRun(ctx.em, run, { status: 'failed', cost: ctx.ledger.snapshot(), error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
