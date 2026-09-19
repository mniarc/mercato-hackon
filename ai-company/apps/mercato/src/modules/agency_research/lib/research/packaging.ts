import type { AudytData } from '../../data/schemas/audyt'
import type { BriefData } from '../../data/schemas/brief'
import type { DocumentIssue } from '../../data/schemas/envelope'
import type { KonkurencjaData } from '../../data/schemas/konkurencja'
import { deliverableKinds, pakietDataSchema, type PakietData } from '../../data/schemas/pakiet'
import { publicationOutcomes, type PotwierdzeniePublikacjiData } from '../../data/schemas/potwierdzeniePublikacji'
import type { StrategiaData } from '../../data/schemas/strategia'
import type { ZrodlaData } from '../../data/schemas/zrodla'
import { limits } from '../../data/templates'

/**
 * KLI-PAKIET is arithmetic over what already exists: the manifest points at the
 * current versions, the audit takeaways are a projection of verified findings
 * (never a new analysis), the completion check lists what is missing by name,
 * and the closure gate is deterministic — payment from purchase, completion,
 * a confirmed publication, a real delivery event, no open blockers. Nothing here
 * calls a model; nothing here approves, sends or closes anything.
 */

export type DeliverableKind = (typeof deliverableKinds)[number]
export type PublicationOutcome = (typeof publicationOutcomes)[number]

/** One consumed document as the package sees it: the pinned envelope facts and its data. */
export type PackagedDocument = {
  document_id: string
  version: string
  status: string
  simulation: boolean
  data: unknown
}

export type PackageDocumentKey = 'brief' | 'strategia' | 'tov' | 'plan' | 'post' | 'audyt' | 'konkurencja' | 'zrodla' | 'potwierdzenie'

export type PackageInputs = {
  brand: string
  sku: string
  offerVersion: string
  outputLanguage: 'pl' | 'en'
  documents: Partial<Record<PackageDocumentKey, PackagedDocument | null>>
  /** From the purchase (2.1); never derived here and never re-charged. */
  paymentVerified: boolean
  /** Document ids of WEW-ESKALACJA versions still `open`. */
  openEscalationRefs: string[]
  /** The recorded handover (9.2); absent = nothing has been shared yet. */
  delivery?: PakietData['delivery']
}

export type PackageBuild = { data: PakietData; issues: DocumentIssue[] }

const T = {
  pl: {
    titles: {
      brief: 'Brief potrzeb i celów',
      strategy: 'Strategia komunikacji',
      tov: 'Ton głosu marki',
      plan: 'Plan treści (12 tematów / 30 dni)',
      post: 'Gotowy post',
      audit_takeaways: 'Wnioski z audytu i porównania rynku',
      publication_proof: 'Dowód publikacji',
    } satisfies Record<DeliverableKind, string>,
    missing: (kind: string) => `${kind}: brak dokumentu`,
    blockedDeliverable: (kind: string, reason: string) => `${kind}: ${reason}`,
    publicationNotConfirmed: (outcome: string) => `publikacja: wynik ${outcome}, wymagany confirmed_published`,
    simulated: (ref: string) => `${ref}: wersja zbudowana na niezatwierdzonych dokumentach (symulacja), brak decyzji klienta`,
    notApproved: (ref: string, status: string) => `${ref}: status ${status}, wymagane zatwierdzenie klienta`,
    openEscalation: (ref: string) => `otwarta eskalacja: ${ref}`,
    proofBlocked: 'brak potwierdzonej publikacji',
    takeawaysBlocked: 'brak sprawdzonego audytu lub porównania rynku',
    gapImplication: (destination: string) => `Uwzględnione w strategii: ${destination}`,
    gapLimitation: 'Ustalenie z publicznych materiałów; skutek biznesowy pozostaje hipotezą do potwierdzenia przez firmę.',
    noAnalytics: 'Brak dostępu do analityki wewnętrznej — wnioski o skuteczności nie są mierzone, tylko obserwowane w komunikacji.',
    noAnalyticsTopic: 'analityka wewnętrzna',
    assumptionTopic: (impact: string) => `założenie: ${impact}`,
    strategyAssumptionTopic: 'założenie strategii',
    coverageTopic: (requirement: string) => `pokrycie: ${requirement}`,
    howToUse: [
      'Zacznij od zasad strategii i tonu głosu — każdy nowy materiał sprawdzaj wobec nich.',
      'Kolejne tematy bierz z planu w podanej kolejności; każdy ma wskazane dowody i ograniczenia.',
      'Sprawdź ograniczenia dowodów przed użyciem twierdzeń o wynikach lub klientach.',
    ],
    nextContact: 'Kolejne prośby (poprawki, pytania) zgłaszaj przez zwykły kanał zgłoszeń; błędy po naszej stronie poprawiamy, nowy rezultat lub druga publikacja to osobne zamówienie.',
    requiredItem: (kind: string) => kind,
  },
  en: {
    titles: {
      brief: 'Brief of needs and goals',
      strategy: 'Communication strategy',
      tov: 'Brand tone of voice',
      plan: 'Content plan (12 topics / 30 days)',
      post: 'Finished post',
      audit_takeaways: 'Audit and market comparison takeaways',
      publication_proof: 'Proof of publication',
    } satisfies Record<DeliverableKind, string>,
    missing: (kind: string) => `${kind}: document missing`,
    blockedDeliverable: (kind: string, reason: string) => `${kind}: ${reason}`,
    publicationNotConfirmed: (outcome: string) => `publication: outcome ${outcome}, confirmed_published required`,
    simulated: (ref: string) => `${ref}: built on unapproved documents (simulation), no client decision recorded`,
    notApproved: (ref: string, status: string) => `${ref}: status ${status}, client approval required`,
    openEscalation: (ref: string) => `open escalation: ${ref}`,
    proofBlocked: 'no confirmed publication',
    takeawaysBlocked: 'no verified audit or market comparison',
    gapImplication: (destination: string) => `Taken into the strategy: ${destination}`,
    gapLimitation: 'A finding from public materials; its business effect stays a hypothesis for the company to confirm.',
    noAnalytics: 'No access to internal analytics — effectiveness is observed in the communication, not measured.',
    noAnalyticsTopic: 'internal analytics',
    assumptionTopic: (impact: string) => `assumption: ${impact}`,
    strategyAssumptionTopic: 'strategy assumption',
    coverageTopic: (requirement: string) => `coverage: ${requirement}`,
    howToUse: [
      'Start with the strategy and tone-of-voice rules — check every new material against them.',
      'Take the next topics from the plan in the given order; each names its evidence and limits.',
      'Check the evidence limitations before using any claim about results or clients.',
    ],
    nextContact: 'Send further requests (fixes, questions) through the regular request channel; errors on our side are corrected, a new deliverable or a second publication is a separate order.',
    requiredItem: (kind: string) => kind,
  },
} as const

type Texts = (typeof T)['pl'] | (typeof T)['en']

const deliverableDocumentKey: Record<DeliverableKind, PackageDocumentKey> = {
  brief: 'brief',
  strategy: 'strategia',
  tov: 'tov',
  plan: 'plan',
  post: 'post',
  audit_takeaways: 'audyt',
  publication_proof: 'potwierdzenie',
}

const clientApprovedKinds: DeliverableKind[] = ['brief', 'strategy', 'tov', 'plan', 'post']

/** A document status mapped onto the manifest's approval vocabulary; anything unknown is `blocked`, never assumed approved. */
export function approvalStateOf(status: string | null | undefined): PakietData['deliverables_manifest'][number]['approval_state'] {
  switch (status) {
    case 'approved':
      return 'approved'
    case 'simulated_accepted':
      return 'simulated_accepted'
    case 'ready_for_review':
      return 'ready_for_review'
    case 'draft':
    case 'simulated_draft':
      return 'draft'
    default:
      return 'blocked'
  }
}

export function publicationOutcomeOf(potwierdzenie: PackagedDocument | null | undefined): PublicationOutcome {
  const outcome = (potwierdzenie?.data as Partial<PotwierdzeniePublikacjiData> | undefined)?.outcome
  return outcome && (publicationOutcomes as readonly string[]).includes(outcome) ? outcome : 'not_executed'
}

/** One row per purchased result; a missing result is named, never replaced by a summary. */
export function buildManifest(inputs: PackageInputs): PakietData['deliverables_manifest'] {
  const t = T[inputs.outputLanguage]
  const outcome = publicationOutcomeOf(inputs.documents.potwierdzenie)
  return deliverableKinds.map((kind) => {
    const document = inputs.documents[deliverableDocumentKey[kind]] ?? null
    const title = t.titles[kind]
    if (!document) {
      return { kind, title, document_ref: `missing:${kind}`, content_version: 'none', access_ref_or_null: null, approval_state: 'not_applicable' as const, availability_state: 'not_available' as const }
    }
    const base = { kind, title, document_ref: document.document_id, content_version: document.version, access_ref_or_null: null }
    if (kind === 'audit_takeaways') {
      const comparison = inputs.documents.konkurencja ?? null
      return { ...base, approval_state: 'not_applicable' as const, availability_state: comparison ? ('available' as const) : ('blocked' as const) }
    }
    if (kind === 'publication_proof') {
      return { ...base, approval_state: 'not_applicable' as const, availability_state: outcome === 'confirmed_published' ? ('available' as const) : ('blocked' as const) }
    }
    return { ...base, approval_state: approvalStateOf(document.status), availability_state: 'available' as const }
  })
}

/**
 * 3–5 verified findings for the client: the audit's gaps (must first) and the
 * comparison's implications, each with its source reference, what the strategy
 * did with it and its limitation. Fewer than three is a gap owned by 3.7.
 */
export function auditTakeawaysOf(args: { audyt: AudytData | null; konkurencja: KonkurencjaData | null; strategia: StrategiaData | null; outputLanguage: 'pl' | 'en' }): { rows: PakietData['audit_takeaways']; issues: DocumentIssue[] } {
  const t = T[args.outputLanguage]
  const [min, max] = limits.clientText.auditTakeaways
  const rows: PakietData['audit_takeaways'] = []
  const rank = { must: 0, should: 1, could: 2 } as const
  const gaps = [...(args.audyt?.gaps ?? [])].sort((a, b) => (rank[a.priority as keyof typeof rank] ?? 3) - (rank[b.priority as keyof typeof rank] ?? 3))
  for (const gap of gaps) {
    rows.push({
      finding: gap.observation,
      source_finding_ref: `WEW-AUDYT.gaps.${gap.gap_id}`,
      implication: gap.business_impact_hypothesis ? `${gap.business_impact_hypothesis} — ${t.gapImplication(gap.destination)}` : t.gapImplication(gap.destination),
      limitation: t.gapLimitation,
    })
  }
  for (const [index, implication] of (args.konkurencja?.implications ?? []).entries()) {
    rows.push({
      finding: implication.finding,
      source_finding_ref: `WEW-KONKURENCJA.implications[${index}]`,
      implication: t.gapImplication(implication.strategy_field),
      limitation: implication.limitation,
    })
  }
  const issues: DocumentIssue[] = []
  if (rows.length < min) {
    issues.push({ code: 'AUDIT_TAKEAWAYS_SHORT', severity: 'blocking', detail: `${rows.length} verified takeaways available, at least ${min} expected; the audit or comparison must be completed in 3.7`, path: 'audit_takeaways' })
  }
  if (args.strategia && args.strategia.measurement_hypothesis.baseline === null && rows.length) {
    rows[0] = { ...rows[0], limitation: `${rows[0].limitation} ${t.noAnalytics}` }
  }
  return { rows: rows.slice(0, max), issues }
}

/** Known unknowns the client should carry forward: open assumptions, strategy boundaries, register gaps, missing analytics. */
export function limitationsOf(args: { brief: BriefData | null; strategia: StrategiaData | null; zrodla: ZrodlaData | null; outputLanguage: 'pl' | 'en'; max?: number }): PakietData['limitations'] {
  const t = T[args.outputLanguage]
  const rows: PakietData['limitations'] = []
  for (const assumption of args.brief?.open_assumptions ?? []) {
    if (assumption.state !== 'open') continue
    rows.push({ topic: t.assumptionTopic(assumption.impact), limitation: assumption.text, source_ref: `KLI-BRIEF.open_assumptions.${assumption.assumption_id}` })
  }
  for (const [index, assumption] of (args.strategia?.creative_boundaries.open_assumptions ?? []).entries()) {
    rows.push({ topic: t.strategyAssumptionTopic, limitation: assumption, source_ref: `KLI-STRATEGIA.creative_boundaries.open_assumptions[${index}]` })
  }
  for (const item of args.zrodla?.coverage ?? []) {
    if (item.item_type !== 'requirement_coverage' || item.readiness === 'ready' || !item.gap) continue
    rows.push({ topic: t.coverageTopic(item.requirement), limitation: item.gap, source_ref: `WEW-ZRODLA.coverage.${item.requirement}` })
  }
  if (args.strategia && args.strategia.measurement_hypothesis.baseline === null) {
    rows.push({ topic: t.noAnalyticsTopic, limitation: t.noAnalytics, source_ref: 'KLI-STRATEGIA.measurement_hypothesis.baseline' })
  }
  return rows.slice(0, args.max ?? 6)
}

/** Quantity, right versions, gates and no open blocks — `complete` only with an empty blocker list. */
export function completionCheckOf(args: {
  manifest: PakietData['deliverables_manifest']
  documents: PackageInputs['documents']
  publicationOutcome: PublicationOutcome
  openEscalationRefs: string[]
  outputLanguage: 'pl' | 'en'
}): PakietData['completion_check'] {
  const t = T[args.outputLanguage]
  const blockers: string[] = []
  for (const row of args.manifest) {
    if (row.availability_state === 'not_available') blockers.push(t.missing(row.kind))
    else if (row.availability_state === 'blocked') blockers.push(t.blockedDeliverable(row.kind, row.kind === 'publication_proof' ? t.proofBlocked : t.takeawaysBlocked))
  }
  if (args.publicationOutcome !== 'confirmed_published' && !blockers.some((b) => b.startsWith('publication_proof'))) blockers.push(t.publicationNotConfirmed(args.publicationOutcome))
  for (const kind of clientApprovedKinds) {
    const document = args.documents[deliverableDocumentKey[kind]] ?? null
    if (!document) continue
    if (document.simulation) blockers.push(t.simulated(document.document_id))
    else if (document.status !== 'approved') blockers.push(t.notApproved(document.document_id, document.status))
  }
  for (const ref of args.openEscalationRefs) blockers.push(t.openEscalation(ref))
  return {
    state: blockers.length ? 'incomplete' : 'complete',
    required_items: deliverableKinds.map((kind) => t.requiredItem(kind)),
    unresolved_changes: [],
    blockers,
  }
}

/** Deterministic: every flag must be true and no blocker may be open; any unknown is false. */
export function closureGateOf(args: { paymentVerified: boolean; completion: PakietData['completion_check']; publicationOutcome: PublicationOutcome; delivery: PakietData['delivery'] }): PakietData['closure_gate'] {
  const completionPassed = args.completion.state === 'complete'
  const publicationVerified = args.publicationOutcome === 'confirmed_published'
  const deliveryVerified = args.delivery.state === 'delivered' && args.delivery.delivered_at_or_null !== null && args.delivery.delivery_evidence_ref_or_null !== null
  const openBlockers = args.completion.blockers.length > 0
  return {
    payment_verified: args.paymentVerified,
    completion_passed: completionPassed,
    publication_verified: publicationVerified,
    delivery_verified: deliveryVerified,
    open_blockers: openBlockers,
    close_allowed: args.paymentVerified && completionPassed && publicationVerified && deliveryVerified && !openBlockers,
  }
}

/** Why the gate is closed, one reason per false flag — for the 9.3 task run. */
export function closureReasons(gate: PakietData['closure_gate']): string[] {
  const reasons: string[] = []
  if (!gate.payment_verified) reasons.push('payment_not_verified')
  if (!gate.completion_passed) reasons.push('completion_not_passed')
  if (!gate.publication_verified) reasons.push('publication_not_confirmed')
  if (!gate.delivery_verified) reasons.push('delivery_not_verified')
  if (gate.open_blockers) reasons.push('open_blockers')
  return reasons
}

export const notExecutedDelivery: PakietData['delivery'] = { state: 'not_executed', channel_or_null: null, recipient_ref_or_null: null, delivered_at_or_null: null, delivery_evidence_ref_or_null: null }

/** Reads a payment confirmation off the order record (2.1); absent or anything but `paid` is false. */
export function paymentVerifiedOf(orderData: unknown): boolean {
  const order = orderData as { terms_confirmation?: Record<string, unknown>; billing?: Record<string, unknown> } | null | undefined
  const candidates = [order?.terms_confirmation?.payment_state, order?.billing?.payment_state]
  return candidates.some((state) => state === 'paid')
}

const dataOf = <D>(document: PackagedDocument | null | undefined): D | null => (document ? (document.data as D) : null)

/** Pure assembly of KLI-PAKIET from the current versions; validated against the contract. */
export function buildPackage(inputs: PackageInputs): PackageBuild {
  const t = T[inputs.outputLanguage]
  const issues: DocumentIssue[] = []
  const documents = inputs.documents
  const manifest = buildManifest(inputs)
  const takeaways = auditTakeawaysOf({ audyt: dataOf<AudytData>(documents.audyt), konkurencja: dataOf<KonkurencjaData>(documents.konkurencja), strategia: dataOf<StrategiaData>(documents.strategia), outputLanguage: inputs.outputLanguage })
  issues.push(...takeaways.issues)
  const publicationOutcome = publicationOutcomeOf(documents.potwierdzenie)
  const potwierdzenie = dataOf<PotwierdzeniePublikacjiData>(documents.potwierdzenie)
  const delivery = inputs.delivery ?? notExecutedDelivery
  const completion = completionCheckOf({ manifest, documents, publicationOutcome, openEscalationRefs: inputs.openEscalationRefs, outputLanguage: inputs.outputLanguage })
  const gate = closureGateOf({ paymentVerified: inputs.paymentVerified, completion, publicationOutcome, delivery })
  if (completion.state === 'incomplete') {
    issues.push({ code: 'PACKAGE_INCOMPLETE', severity: 'blocking', detail: completion.blockers.join('; '), path: 'completion_check' })
  }
  const documentRef = (key: PackageDocumentKey) => documents[key]?.document_id ?? `missing:${key}`
  const data: PakietData = {
    package_identity: {
      brand: inputs.brand,
      purchased_sku: inputs.sku,
      purchased_offer_version: inputs.offerVersion,
      realization_state: delivery.state === 'delivered' ? 'delivered' : completion.state === 'complete' ? 'ready_for_delivery' : 'preparing',
    },
    deliverables_manifest: manifest,
    audit_takeaways: takeaways.rows,
    publication_receipt_ref: {
      receipt_ref: documents.potwierdzenie?.document_id ?? 'missing:potwierdzenie',
      outcome: publicationOutcome,
      verified_url_or_null: publicationOutcome === 'confirmed_published' ? (potwierdzenie?.external_artifact.verified_url_or_null ?? null) : null,
    },
    how_to_use: [
      { action: t.howToUse[0], document_ref: documentRef('strategia') },
      { action: t.howToUse[1], document_ref: documentRef('plan') },
      { action: t.howToUse[2], document_ref: documentRef('zrodla') },
    ].slice(0, limits.clientText.howToUseMax),
    limitations: limitationsOf({ brief: dataOf<BriefData>(documents.brief), strategia: dataOf<StrategiaData>(documents.strategia), zrodla: dataOf<ZrodlaData>(documents.zrodla), outputLanguage: inputs.outputLanguage }),
    completion_check: completion,
    delivery,
    closure_gate: gate,
    next_contact: t.nextContact.slice(0, limits.clientText.nextContactCharsMax),
  }
  return { data: pakietDataSchema.parse(data), issues }
}
