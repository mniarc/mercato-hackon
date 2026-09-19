import { adapterFor, type PublicationAdapter } from '../../data/adapters'
import type { InputVersion } from '../../data/schemas/envelope'
import { konfigPublikacjiDataSchema, type KonfigPublikacjiData } from '../../data/schemas/konfigPublikacji'
import type { PostData } from '../../data/schemas/post'
import { potwierdzeniePublikacjiDataSchema, type PotwierdzeniePublikacjiData } from '../../data/schemas/potwierdzeniePublikacji'
import type { OrderFacts } from '../../data/schemas/zamowienie'
import {
  contentApprovalCheckSchema,
  preflightGates,
  publicationConsentCheckSchema,
  zleceniePublikacjiDataSchema,
  type ContentApprovalCheck,
  type PreflightCheck,
  type PublicationConsentCheck,
  type ZleceniePublikacjiData,
} from '../../data/schemas/zleceniePublikacji'
import { sha256 } from './util'

/**
 * P8 — publication as documents, never as an action. This lane produces the
 * configuration (8.2), the order with its preflight (8.3) and the outcome record
 * (8.7) exactly as STD-PROCES / Q-PUB define them, and stops there: no adapter
 * is called, no reservation is taken, no message is sent.
 *
 * Where a real adapter would plug in (8.4–8.6), and the invariants it must keep:
 * - 8.4 reserves ONE attempt atomically on `execution_guard.idempotency_key`
 *   (order + task + content version + destination); a second reservation for the
 *   same key while one is `reserved | confirmed | unknown` is refused.
 * - 8.5 re-checks reservation, version, consent and hold immediately before the
 *   send, flips the attempt to `sending`, sends the payload byte-for-byte (no
 *   shortening, no hashtags, no CTA added) with one bounded timeout.
 * - 8.6 classifies: provider id → `confirmed_published`; a 4xx that proves nothing
 *   was posted → `confirmed_not_sent` (limited retry through 8.4 only); timeout,
 *   dropped socket, 5xx, no response → `unknown`, which forbids automatic retry
 *   and closure until reconciled against the platform or resolved by staff (E.1).
 * - Consent is bound to a content hash AND a destination; a new version or a new
 *   place needs a new consent. A synthetic approval is `missing` in a real run.
 * - External ids, URLs and timestamps come only from the provider's response or
 *   a verified read; the model never synthesises them.
 */

export type ConfigInput = {
  order: Pick<OrderFacts, 'brand' | 'officialSocialUrl' | 'officialSocialPlatform'>
  /** A reference into the integrations store (never a secret); `null` = not provided. */
  connectionRef?: string | null
  now?: Date
}

const T = {
  pl: {
    noAdapter: (platform: string | null) => `Brak adaptera dla platformy „${platform ?? 'nieznana'}” w katalogu wspieranych integracji.`,
    noPlatform: 'Zamówienie nie wskazuje platformy publikacji (official_social).',
    noDestinationId: 'Brak trwałego identyfikatora konta/kanału z platformy — nazwa profilu nie zastępuje ID.',
    noConnection: 'Brak połączenia w magazynie integracji (connection_ref).',
    notValidated: 'Dostęp do miejsca publikacji nie został zweryfikowany (bez publikacji testowej).',
    bindingBasis: 'official_social z formularza zamówienia (WEW-DANE-ZAMOWIENIA)',
    nextActionReady: 'Gotowe technicznie; zgoda na treść i na publikację pozostają odrębnymi bramkami.',
    nextActionBlocked: 'Operacje: uzupełnić identyfikatory miejsca i połączenie, zweryfikować dostęp; pytanie do klienta tylko o wskazanie konta/kanału, nigdy o sekrety.',
    validationMethod: 'none',
  },
  en: {
    noAdapter: (platform: string | null) => `No adapter for platform "${platform ?? 'unknown'}" in the supported integrations catalog.`,
    noPlatform: 'The order names no publication platform (official_social).',
    noDestinationId: 'No durable account/channel id from the platform — a profile name is not an id.',
    noConnection: 'No connection in the integrations store (connection_ref).',
    notValidated: 'Access to the destination has not been verified (no test publication).',
    bindingBasis: 'official_social from the order form (WEW-DANE-ZAMOWIENIA)',
    nextActionReady: 'Technically ready; content approval and publication consent remain separate gates.',
    nextActionBlocked: 'Operations: fill in destination ids and the connection, verify access; ask the client only for the account/channel, never for secrets.',
    validationMethod: 'none',
  },
} as const

export type Lang = keyof typeof T

/** 8.2 — pure: the configuration this order can prove today; `ready` needs ids, a connection and a verified check. */
export function buildPublicationConfig(input: ConfigInput, lang: Lang): { data: KonfigPublikacjiData; adapter: PublicationAdapter | null; blockers: string[] } {
  const t = T[lang]
  const adapter = adapterFor(input.order.officialSocialPlatform)
  const connectionRef = input.connectionRef?.trim() ? input.connectionRef.trim() : null
  const blockers: string[] = []
  if (!input.order.officialSocialPlatform) blockers.push(`NO_PLATFORM: ${t.noPlatform}`)
  else if (!adapter) blockers.push(`NO_ADAPTER: ${t.noAdapter(input.order.officialSocialPlatform)}`)
  blockers.push(`NO_DESTINATION_ID: ${t.noDestinationId}`)
  if (!connectionRef) blockers.push(`NO_CONNECTION: ${t.noConnection}`)
  blockers.push(`NOT_VALIDATED: ${t.notValidated}`)
  const data = konfigPublikacjiDataSchema.parse({
    platform: {
      platform: adapter?.platform ?? input.order.officialSocialPlatform ?? 'unknown',
      adapter_id: adapter?.adapter_id ?? 'none',
      adapter_version: adapter?.adapter_version ?? 'none',
    },
    destination_identity: {
      account_or_workspace_id_or_null: null,
      channel_or_page_id_or_null: null,
      display_name: input.order.officialSocialUrl ? `${input.order.brand} — ${input.order.officialSocialUrl}` : input.order.brand,
      public_url_or_null: input.order.officialSocialUrl,
    },
    brand_binding: { brand_name: input.order.brand, binding_basis: t.bindingBasis, confirmation_ref_or_null: null },
    secure_connection: { connection_ref_or_null: connectionRef, connection_state: connectionRef ? 'connected' : 'not_provided' },
    capabilities: {
      can_publish_text: adapter?.can_publish_text ?? 'unknown',
      can_read_result: adapter?.can_read_result ?? 'unknown',
      length_limit_or_unknown: adapter ? adapter.max_text_length : 'unknown',
      mention_controls: adapter?.mention_controls ?? 'unknown',
      checked_at_or_null: null,
    },
    connection_validation: { state: 'not_executed', method: t.validationMethod, checked_at_or_null: null, evidence_ref_or_null: null, failure_code_or_null: null },
    access_owner: { client_contact_ref_or_null: null, internal_role: 'operations' },
    readiness: { state: blockers.length ? 'not_ready' : 'ready', blockers, next_action: blockers.length ? t.nextActionBlocked : t.nextActionReady },
  })
  return { data, adapter, blockers }
}

/** The immutable identity of what would be published: text plus every link and mention, order-independent. */
export function contentHashOf(post: Pick<PostData, 'text' | 'links_and_mentions'>): string {
  const links = post.links_and_mentions.filter((row) => row.type === 'link').map((row) => row.value).sort()
  const mentions = post.links_and_mentions.filter((row) => row.type === 'mention').map((row) => row.value).sort()
  return sha256(JSON.stringify({ text: post.text, links, mentions }))
}

export function idempotencyKeyOf(args: { orderRef: string; postVersion: string; destinationLabel: string }): string {
  return sha256(`${args.orderRef}|publication|${args.postVersion}|${args.destinationLabel}`).slice(0, 32)
}

export type PostVersionFacts = {
  documentId: string
  version: string
  status: string | undefined
  /** COMMON-ENVELOPE `approval_records` of that exact version. */
  approvalRecords: { person: string; at: string; scope: string; version: string }[]
  /** Whether this version is the document's current one. */
  isCurrent: boolean
}

/** Content approval is a real client record on this exact version; a document merely `approved` without a record stays `missing`. */
export function contentApprovalCheck(post: PostVersionFacts): ContentApprovalCheck {
  const record = post.approvalRecords.find((r) => r.version === post.version)
  let state: ContentApprovalCheck['state'] = 'missing'
  if (record && post.status === 'approved') state = post.isCurrent ? 'valid' : 'stale'
  else if (record && post.status === 'needs_review') state = 'revoked'
  return contentApprovalCheckSchema.parse({ state, approval_ref_or_null: record ? `${post.documentId}@${post.version}:${record.person}:${record.at}` : null, checked_content_version: post.version })
}

/** No consent register exists in this lane: consent is always `missing` here (never inferred from content approval). */
export function publicationConsentCheck(): PublicationConsentCheck {
  return publicationConsentCheckSchema.parse({ state: 'missing', consent_ref_or_null: null, bound_content_hash_or_null: null, bound_destination_or_null: null })
}

export type PreflightInput = {
  post: PostData
  postVersion: PostVersionFacts
  config: KonfigPublikacjiData
  adapter: PublicationAdapter | null
  contentApproval: ContentApprovalCheck
  consent: PublicationConsentCheck
  hold: ZleceniePublikacjiData['current_hold']
  guard: Pick<ZleceniePublikacjiData['execution_guard'], 'reservation_state' | 'prior_outcome'>
  /** From WEW-ZLECENIE-POSTU.delivery_constraints when known; Q-PUB needs the used CTA `ready`. */
  ctaPublicationReadiness?: string | null
}

const PF = {
  pl: {
    scopeOk: 'Jeden post tekstowy na platformę z zamówienia; CTA gotowe do publikacji.',
    scopePlatform: (a: string, b: string) => `Kanał postu „${a}” nie odpowiada skonfigurowanej platformie „${b}”.`,
    scopeCount: 'Post przewiduje więcej niż jedną publikację.',
    scopeCta: (state: string) => `CTA ma publication_readiness=${state}; wymagane ready.`,
    versionOk: 'Przypięta wersja jest bieżącą wersją dokumentu.',
    versionStale: 'Przypięta wersja nie jest bieżącą wersją KLI-POST.',
    versionReview: 'KLI-POST ma status needs_review.',
    approval: (state: string) => `Zgoda na treść: ${state}.`,
    consent: (state: string) => `Zgoda na publikację tej wersji w tym miejscu: ${state}.`,
    destinationOk: 'Miejsce ma trwały identyfikator i gotową konfigurację.',
    destinationIds: 'Brak identyfikatora konta/kanału.',
    destinationReadiness: (state: string) => `Konfiguracja publikacji: ${state}.`,
    accessOk: 'Połączenie zweryfikowane.',
    accessNo: (conn: string, validation: string) => `Połączenie: ${conn}; weryfikacja: ${validation}.`,
    formatOk: (chars: number, limit: number) => `${chars} znaków ≤ limit adaptera ${limit}.`,
    formatOver: (chars: number, limit: number) => `${chars} znaków > limit adaptera ${limit}.`,
    formatUnknown: 'Limit platformy nieznany — brak wersjonowanego adaptera.',
    holdOk: 'Brak wstrzymania.',
    holdNo: (state: string, reason: string | null) => `Wstrzymanie: ${state}${reason ? ` — ${reason}` : ''}.`,
    attemptOk: 'Brak wcześniejszej nierozstrzygniętej lub wykonanej próby.',
    attemptNo: (reservation: string, prior: string) => `Rezerwacja: ${reservation}; poprzedni wynik: ${prior}.`,
  },
  en: {
    scopeOk: 'One text post on the platform from the order; CTA ready for publication.',
    scopePlatform: (a: string, b: string) => `Post channel "${a}" does not match the configured platform "${b}".`,
    scopeCount: 'The post foresees more than one publication.',
    scopeCta: (state: string) => `CTA has publication_readiness=${state}; ready is required.`,
    versionOk: 'The pinned version is the document\'s current version.',
    versionStale: 'The pinned version is not the current KLI-POST version.',
    versionReview: 'KLI-POST is in needs_review.',
    approval: (state: string) => `Content approval: ${state}.`,
    consent: (state: string) => `Consent to publish this version at this destination: ${state}.`,
    destinationOk: 'The destination has a durable id and a ready configuration.',
    destinationIds: 'No account/channel id.',
    destinationReadiness: (state: string) => `Publication configuration: ${state}.`,
    accessOk: 'Connection verified.',
    accessNo: (conn: string, validation: string) => `Connection: ${conn}; validation: ${validation}.`,
    formatOk: (chars: number, limit: number) => `${chars} characters ≤ adapter limit ${limit}.`,
    formatOver: (chars: number, limit: number) => `${chars} characters > adapter limit ${limit}.`,
    formatUnknown: 'Platform limit unknown — no versioned adapter.',
    holdOk: 'No hold.',
    holdNo: (state: string, reason: string | null) => `Hold: ${state}${reason ? ` — ${reason}` : ''}.`,
    attemptOk: 'No earlier unresolved or executed attempt.',
    attemptNo: (reservation: string, prior: string) => `Reservation: ${reservation}; prior outcome: ${prior}.`,
  },
} as const

const matchesPlatform = (channel: string, platform: string) => channel.toLowerCase().includes(platform.toLowerCase())

/** Q-PUB as nine rows; `ready` only when every row passes from the CURRENT state, never from an older QA result. */
export function evaluatePreflight(input: PreflightInput, lang: Lang, now: Date = new Date()): ZleceniePublikacjiData['preflight'] {
  const t = PF[lang]
  const { post, postVersion, config, adapter, contentApproval, consent, hold, guard } = input
  const row = (gate: PreflightCheck['gate'], result: PreflightCheck['result'], detail: string): PreflightCheck => ({ gate, result, detail })
  const rows: PreflightCheck[] = []

  const scopeProblems: string[] = []
  if (!matchesPlatform(post.target.channel, config.platform.platform)) scopeProblems.push(t.scopePlatform(post.target.channel, config.platform.platform))
  if (post.target.finished_post_count !== 1) scopeProblems.push(t.scopeCount)
  if (input.ctaPublicationReadiness && input.ctaPublicationReadiness !== 'ready') scopeProblems.push(t.scopeCta(input.ctaPublicationReadiness))
  rows.push(row('scope', scopeProblems.length ? 'fail' : 'pass', scopeProblems.join(' ') || t.scopeOk))

  rows.push(!postVersion.isCurrent ? row('version', 'fail', t.versionStale) : postVersion.status === 'needs_review' ? row('version', 'fail', t.versionReview) : row('version', 'pass', t.versionOk))
  rows.push(row('content_approval', contentApproval.state === 'valid' ? 'pass' : 'fail', t.approval(contentApproval.state)))
  rows.push(row('publication_consent', consent.state === 'valid' ? 'pass' : 'fail', t.consent(consent.state)))

  const hasId = config.destination_identity.account_or_workspace_id_or_null !== null || config.destination_identity.channel_or_page_id_or_null !== null
  rows.push(!hasId ? row('destination', 'fail', t.destinationIds) : config.readiness.state !== 'ready' ? row('destination', 'fail', t.destinationReadiness(config.readiness.state)) : row('destination', 'pass', t.destinationOk))

  const accessOk = config.secure_connection.connection_state === 'connected' && config.connection_validation.state === 'verified'
  rows.push(accessOk ? row('access', 'pass', t.accessOk) : row('access', 'fail', t.accessNo(config.secure_connection.connection_state, config.connection_validation.state)))

  const chars = post.text.length
  if (!adapter) rows.push(row('format', 'unknown', t.formatUnknown))
  else rows.push(chars > adapter.max_text_length ? row('format', 'fail', t.formatOver(chars, adapter.max_text_length)) : row('format', 'pass', t.formatOk(chars, adapter.max_text_length)))

  rows.push(hold.state === 'none' ? row('no_hold', 'pass', t.holdOk) : row('no_hold', 'fail', t.holdNo(hold.state, hold.reason_or_null)))

  const attemptClear = guard.reservation_state === 'none' && (guard.prior_outcome === 'none' || guard.prior_outcome === 'not_executed' || guard.prior_outcome === 'confirmed_not_sent')
  rows.push(attemptClear ? row('no_pending_attempt', 'pass', t.attemptOk) : row('no_pending_attempt', 'fail', t.attemptNo(guard.reservation_state, guard.prior_outcome)))

  const ordered = preflightGates.map((gate) => rows.find((r) => r.gate === gate)!)
  return { state: ordered.every((r) => r.result === 'pass') ? 'ready' : 'not_ready', check_results: ordered, checked_at_or_null: now.toISOString() }
}

export type OrderInput = {
  orderRef: string
  post: PostData
  postVersion: PostVersionFacts
  config: KonfigPublikacjiData
  configVersion: InputVersion
  adapter: PublicationAdapter | null
  /** An unresolved WEW-ESKALACJA on the order; its reference when any. */
  openEscalationRef?: string | null
  /** The outcome of the last confirmation for the same idempotency key, if any. */
  priorOutcome?: PotwierdzeniePublikacjiData['outcome'] | null
  ctaPublicationReadiness?: string | null
  now?: Date
}

const HOLD = {
  pl: { exception: 'Otwarty wyjątek E.1 na zamówieniu.' },
  en: { exception: 'An open E.1 exception on the order.' },
} as const

/** 8.3 — pure: the order compiled from the pinned post version; compiling grants neither readiness nor approval. */
export function buildPublicationOrder(input: OrderInput, lang: Lang): { data: ZleceniePublikacjiData; contentHash: string } {
  const now = input.now ?? new Date()
  const { post, config } = input
  const contentHash = contentHashOf(post)
  const destinationLabel = config.destination_identity.display_name
  const contentApproval = contentApprovalCheck(input.postVersion)
  const consent = publicationConsentCheck()
  const hold: ZleceniePublikacjiData['current_hold'] = input.openEscalationRef
    ? { state: 'exception', reason_or_null: HOLD[lang].exception, request_ref_or_null: input.openEscalationRef }
    : { state: 'none', reason_or_null: null, request_ref_or_null: null }
  const guard: ZleceniePublikacjiData['execution_guard'] = {
    idempotency_key: idempotencyKeyOf({ orderRef: input.orderRef, postVersion: input.postVersion.version, destinationLabel }),
    reservation_state: 'none',
    attempt_refs: [],
    prior_outcome: input.priorOutcome ?? 'none',
  }
  const preflight = evaluatePreflight({ post, postVersion: input.postVersion, config, adapter: input.adapter, contentApproval, consent, hold, guard, ctaPublicationReadiness: input.ctaPublicationReadiness }, lang, now)
  const data = zleceniePublikacjiDataSchema.parse({
    post_ref: { document_ref: input.postVersion.documentId, content_version: input.postVersion.version, content_hash: contentHash },
    payload: {
      text: post.text,
      link_refs: post.links_and_mentions.filter((row) => row.type === 'link').map((row) => row.value),
      mention_policy: 'no_mentions_unless_approved',
      platform_format: input.adapter ? `${input.adapter.adapter_id}@${input.adapter.adapter_version}:${input.adapter.format}` : 'text',
    },
    destination: {
      platform: config.platform.platform,
      account_or_workspace_id_or_null: config.destination_identity.account_or_workspace_id_or_null,
      channel_or_page_id_or_null: config.destination_identity.channel_or_page_id_or_null,
      display_label: destinationLabel,
      config_ref_or_null: `${input.configVersion.document_id}@${input.configVersion.version}`,
    },
    content_approval_check: contentApproval,
    publication_consent_check: consent,
    execution_guard: guard,
    current_hold: hold,
    preflight,
    delivery_instruction: { mode: 'immediate_after_valid_gates', requested_time_or_null: null },
  })
  return { data, contentHash }
}

const CONF = {
  pl: {
    message: (gates: string[]) => `Wykonania nie podjęto: niespełnione bramki ${gates.join(', ')}.`,
    holdMessage: 'Wykonania nie podjęto: zlecenie wstrzymane.',
    requiredEvidence: 'Ważna zgoda na treść i na publikację tej wersji w tym miejscu, zweryfikowane połączenie, preflight=ready z bieżącego stanu.',
  },
  en: {
    message: (gates: string[]) => `Not executed: gates not met — ${gates.join(', ')}.`,
    holdMessage: 'Not executed: the order is on hold.',
    requiredEvidence: 'Valid content approval and publication consent for this version at this destination, a verified connection, preflight=ready from the current state.',
  },
} as const

/** 8.7 — pure: the record of an attempt that never happened; every external field stays null. */
export function buildPublicationConfirmation(input: { order: ZleceniePublikacjiData; orderRef: InputVersion }, lang: Lang): PotwierdzeniePublikacjiData {
  const t = CONF[lang]
  const { order } = input
  const failed = order.preflight.check_results.filter((r) => r.result !== 'pass').map((r) => r.gate)
  return potwierdzeniePublikacjiDataSchema.parse({
    execution_ref: { publication_order_ref: `${input.orderRef.document_id}@${input.orderRef.version}`, attempt_id_or_null: null, reservation_key_or_null: null },
    approved_material_ref: {
      post_ref: order.post_ref.document_ref,
      content_version: order.post_ref.content_version,
      content_hash: order.post_ref.content_hash,
      content_approval_ref_or_null: order.content_approval_check.approval_ref_or_null,
      publication_consent_ref_or_null: order.publication_consent_check.consent_ref_or_null,
    },
    destination: {
      platform: order.destination.platform,
      account_or_workspace_id_or_null: order.destination.account_or_workspace_id_or_null,
      channel_or_page_id_or_null: order.destination.channel_or_page_id_or_null,
    },
    outcome: 'not_executed',
    external_artifact: { external_post_id_or_null: null, verified_url_or_null: null, published_at_or_null: null },
    proof: { method: 'none', evidence_ref_or_null: null, verified_at_or_null: null, content_match_state: 'not_checked' },
    failure_details: {
      code_or_null: order.current_hold.state !== 'none' ? 'ON_HOLD' : 'GATES_NOT_MET',
      sanitized_message_or_null: order.current_hold.state !== 'none' ? t.holdMessage : t.message(failed.length ? failed : ['none']),
      evidence_ref_or_null: `${input.orderRef.document_id}@${input.orderRef.version}#preflight`,
    },
    recovery: { next_action: 'obtain_missing_gates', retry_allowed: false, required_evidence: t.requiredEvidence, exception_ref_or_null: order.current_hold.request_ref_or_null },
    client_receipt: null,
  })
}
