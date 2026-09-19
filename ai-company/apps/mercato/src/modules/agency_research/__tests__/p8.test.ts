import { adapterFor } from '../data/adapters'
import type { InputVersion, TemplateId } from '../data/schemas/envelope'
import { postDataSchema, type PostData } from '../data/schemas/post'
import { potwierdzeniePublikacjiDataSchema } from '../data/schemas/potwierdzeniePublikacji'
import type { OrderFacts } from '../data/schemas/zamowienie'
import { preflightGates, zleceniePublikacjiDataSchema } from '../data/schemas/zleceniePublikacji'
import { createLedger } from '../lib/research/ledger'
import {
  buildPublicationConfig,
  buildPublicationConfirmation,
  buildPublicationOrder,
  contentApprovalCheck,
  contentHashOf,
  evaluatePreflight,
  idempotencyKeyOf,
  publicationConsentCheck,
  type PostVersionFacts,
} from '../lib/research/publication'
import { renderKonfigPublikacji, renderKonfigPublikacjiClientView } from '../lib/research/render/konfigPublikacji'
import { renderPotwierdzeniePublikacji, renderPotwierdzeniePublikacjiClientView } from '../lib/research/render/potwierdzeniePublikacji'
import { renderZleceniePublikacji, renderZleceniePublikacjiClientView } from '../lib/research/render/zleceniePublikacji'
import type { StepContext } from '../lib/research/steps/context'
import { runPublicationConfigStep } from '../lib/research/steps/publicationConfig'
import { runPublicationConfirmationStep } from '../lib/research/steps/publicationConfirmation'
import { runPublicationOrderStep } from '../lib/research/steps/publicationOrder'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), currentInputVersion: jest.fn(), saveDocumentVersion: jest.fn() }
})

const order: OrderFacts = {
  brand: 'FLOW Centrum Badawcze',
  websiteUrl: 'https://makeitflow.pl/index.php',
  market: 'Polska',
  language: 'pl',
  outputLanguage: 'pl',
  officialSocialUrl: 'https://www.linkedin.com/company/flow-centrum-badawcze/',
  officialSocialPlatform: 'LinkedIn',
  purchaseGoal: 'Wyjaśnić, jak FLOW pomaga dojść od problemu do rozwiązania.',
  sku: 'START-KOMUNIKACJI-PL-01',
  topics: 12,
}

const TEXT = 'Chcesz nowego narzędzia do obsługi zamówień? Zacznij od czterech pytań o potrzeby, cel, organizację pracy i możliwości techniczne. Napisz do nas: https://makeitflow.pl/index.php'

function post(overrides: Partial<PostData> = {}): PostData {
  return postDataSchema.parse({
    text: TEXT,
    target: {
      channel: 'LinkedIn firmy FLOW', language: 'pl-PL', market: 'Polska', format: 'text', finished_post_count: 1, adapter_id: 'linkedin-company-post-text', adapter_version: '0.1.0',
      platform_character_limit: 3000, platform_limit_status: 'known', target_account_id: null, publication_status: 'blocked_simulation', publication_allowed: false,
    },
    claims_map: [{ id: 'CM-01', fragment: 'Zacznij od czterech pytań', claim_id: 'CL01', fact_ids: ['F03'], creative_payload_ids: ['T01'], kind: 'creative_example', evidence_kind: 'creative_proposal', source_ids: ['S-01'], limitation: 'propozycja redakcyjna', used_within_evidence: true, source_relationship: 'inspiracja z faktu' }],
    links_and_mentions: [{ type: 'link', value: 'https://makeitflow.pl/index.php', purpose: 'kontakt', owner: 'FLOW', contact_owner: null, verification_status: 'observed_in_frozen_input', operational_status: 'not_tested', opened_during_authoring: false, claim_id: null, fact_id: 'F07', source_id: 'S-01' }],
    client_note: 'Post otwiera pytaniem odbiorcy i kończy kontaktem.',
    qa: {
      review_type: 'author_self_check', status: 'draft', is_independent_review: false, independent_editor_review: null,
      copy_checks: [{ id: 'TOV-01', question: 'Czy otwarcie nazywa decyzję odbiorcy?', result: 'pass', evidence: 'pytanie o narzędzie' }],
      metrics: { word_count: 22, word_count_rule: 'białe znaki', character_count_with_spaces_and_newlines: TEXT.length, character_count_without_whitespace: TEXT.replace(/\s/g, '').length, line_break_count: 0, words_target: [120, 220], within_internal_word_target: false, client_note_word_count: 7, client_note_max_words: 80, platform_character_limit: 3000, platform_limit_compliance: 'within_limit' },
      instruction_alignment: 'pass', factual_scope: 'pass', tone_of_voice: 'pass', format: 'pass', links: 'pass', unsupported_facts_added: 0, additional_sources_used: 0, additional_research_performed: 0,
      corrections_applied: [], corrections_note: null, evidence_limitations: [], publication_gate: 'blocked', real_approval_recorded: false, author_review_version: '1.0',
    },
    ...overrides,
  })
}

const postVersion = (overrides: Partial<PostVersionFacts> = {}): PostVersionFacts => ({ documentId: 'KLI-POST@o', version: '1.0', status: 'ready_for_review', approvalRecords: [], isCurrent: true, ...overrides })
const approved = (): PostVersionFacts => postVersion({ status: 'approved', approvalRecords: [{ person: 'client-1', at: '2026-09-20T09:00:00.000Z', scope: 'content', version: '1.0' }] })
const configVersion: InputVersion = { document_id: 'WEW-KONFIG-PUBLIKACJI@o', version: '1.0', status: 'blocked' }
const now = new Date('2026-09-20T10:00:00.000Z')

describe('8.2 publication configuration (pure)', () => {
  it('resolves the adapter from the order platform and records every blocker; a profile URL is never an id', () => {
    const { data, adapter, blockers } = buildPublicationConfig({ order, connectionRef: null }, 'pl')
    expect(adapter?.adapter_id).toBe('linkedin-company-post-text')
    expect(data.platform).toEqual({ platform: 'LinkedIn', adapter_id: 'linkedin-company-post-text', adapter_version: '0.1.0' })
    expect(data.destination_identity).toMatchObject({ account_or_workspace_id_or_null: null, channel_or_page_id_or_null: null, public_url_or_null: order.officialSocialUrl })
    expect(data.capabilities.length_limit_or_unknown).toBe(3000)
    expect(data.secure_connection).toEqual({ connection_ref_or_null: null, connection_state: 'not_provided' })
    expect(data.connection_validation.state).toBe('not_executed')
    expect(data.readiness.state).toBe('not_ready')
    expect(blockers.map((b) => b.split(':')[0])).toEqual(['NO_DESTINATION_ID', 'NO_CONNECTION', 'NOT_VALIDATED'])
  })

  it('marks an unsupported platform NO_ADAPTER with an unknown limit, and a missing platform NO_PLATFORM', () => {
    const tiktok = buildPublicationConfig({ order: { ...order, officialSocialPlatform: 'TikTok' } }, 'en')
    expect(tiktok.adapter).toBeNull()
    expect(tiktok.blockers[0]).toMatch(/^NO_ADAPTER/)
    expect(tiktok.data.capabilities.length_limit_or_unknown).toBe('unknown')
    expect(tiktok.data.platform.adapter_id).toBe('none')
    const none = buildPublicationConfig({ order: { ...order, officialSocialPlatform: null, officialSocialUrl: null } }, 'pl')
    expect(none.blockers[0]).toMatch(/^NO_PLATFORM/)
    expect(none.data.destination_identity.display_name).toBe(order.brand)
  })

  it('takes a connection reference without validating it, and never becomes ready on that alone', () => {
    const { data, blockers } = buildPublicationConfig({ order, connectionRef: 'integrations/conn-42' }, 'pl')
    expect(data.secure_connection).toEqual({ connection_ref_or_null: 'integrations/conn-42', connection_state: 'connected' })
    expect(data.connection_validation.state).toBe('not_executed')
    expect(data.readiness.state).toBe('not_ready')
    expect(blockers.some((b) => b.startsWith('NO_CONNECTION'))).toBe(false)
    const md = renderKonfigPublikacji({ outputLanguage: 'pl', brand: order.brand, data, issues: [] })
    expect(md).toContain('integrations/conn-42')
    const view = renderKonfigPublikacjiClientView({ outputLanguage: 'en', brand: order.brand, data })
    expect(view.markdown).toContain('not_ready')
    expect(view.markdown).not.toContain('conn-42')
    expect(view.issue).toBeNull()
  })
})

describe('content hash and idempotency key', () => {
  it('is stable across link order and changes with the text or a link', () => {
    const base = post()
    const reordered = post({ links_and_mentions: [{ ...base.links_and_mentions[0], value: 'https://makeitflow.pl/index.php' }] })
    expect(contentHashOf(base)).toBe(contentHashOf(reordered))
    expect(contentHashOf(base)).toBe(contentHashOf(post()))
    expect(contentHashOf(post({ text: `${TEXT} ` }))).not.toBe(contentHashOf(base))
    const withMention = post({ links_and_mentions: [...base.links_and_mentions, { ...base.links_and_mentions[0], type: 'mention', value: '@flow' }] })
    expect(contentHashOf(withMention)).not.toBe(contentHashOf(base))
    const two = post({ links_and_mentions: [{ ...base.links_and_mentions[0], value: 'https://b.example' }, { ...base.links_and_mentions[0], value: 'https://a.example' }] })
    const twoReversed = post({ links_and_mentions: [{ ...base.links_and_mentions[0], value: 'https://a.example' }, { ...base.links_and_mentions[0], value: 'https://b.example' }] })
    expect(contentHashOf(two)).toBe(contentHashOf(twoReversed))
  })

  it('keys an attempt by order, post version and destination', () => {
    const key = idempotencyKeyOf({ orderRef: 'o', postVersion: '1.0', destinationLabel: 'FLOW — LinkedIn' })
    expect(key).toHaveLength(32)
    expect(idempotencyKeyOf({ orderRef: 'o', postVersion: '1.0', destinationLabel: 'FLOW — LinkedIn' })).toBe(key)
    expect(idempotencyKeyOf({ orderRef: 'o', postVersion: '2.0', destinationLabel: 'FLOW — LinkedIn' })).not.toBe(key)
    expect(idempotencyKeyOf({ orderRef: 'o', postVersion: '1.0', destinationLabel: 'FLOW — Discord' })).not.toBe(key)
  })
})

describe('decision checks', () => {
  it('content approval is valid only for an approved current version with a record on that version', () => {
    expect(contentApprovalCheck(postVersion()).state).toBe('missing')
    expect(contentApprovalCheck(postVersion({ status: 'approved' })).state).toBe('missing')
    expect(contentApprovalCheck(postVersion({ status: 'simulated_accepted', approvalRecords: [{ person: 'sim', at: 'x', scope: 'content', version: '1.0' }] })).state).toBe('missing')
    const valid = contentApprovalCheck(approved())
    expect(valid).toMatchObject({ state: 'valid', checked_content_version: '1.0' })
    expect(valid.approval_ref_or_null).toContain('client-1')
    expect(contentApprovalCheck(approved()).state).toBe('valid')
    expect(contentApprovalCheck({ ...approved(), isCurrent: false }).state).toBe('stale')
    expect(contentApprovalCheck({ ...approved(), status: 'needs_review' }).state).toBe('revoked')
    expect(contentApprovalCheck({ ...approved(), approvalRecords: [{ person: 'client-1', at: 'x', scope: 'content', version: '0.9' }] }).state).toBe('missing')
  })

  it('publication consent is always missing here and bound to nothing', () => {
    expect(publicationConsentCheck()).toEqual({ state: 'missing', consent_ref_or_null: null, bound_content_hash_or_null: null, bound_destination_or_null: null })
  })
})

describe('preflight (Q-PUB)', () => {
  const config = buildPublicationConfig({ order }, 'pl').data
  const base = () => ({
    post: post(),
    postVersion: postVersion(),
    config,
    adapter: adapterFor('LinkedIn'),
    contentApproval: contentApprovalCheck(postVersion()),
    consent: publicationConsentCheck(),
    hold: { state: 'none' as const, reason_or_null: null, request_ref_or_null: null },
    guard: { reservation_state: 'none' as const, prior_outcome: 'none' as const },
  })

  it('evaluates all nine gates in order and is not ready while any fails', () => {
    const result = evaluatePreflight(base(), 'pl', now)
    expect(result.check_results.map((r) => r.gate)).toEqual([...preflightGates])
    expect(result.checked_at_or_null).toBe(now.toISOString())
    const byGate = Object.fromEntries(result.check_results.map((r) => [r.gate, r.result]))
    expect(byGate).toEqual({ scope: 'pass', version: 'pass', content_approval: 'fail', publication_consent: 'fail', destination: 'fail', access: 'fail', format: 'pass', no_hold: 'pass', no_pending_attempt: 'pass' })
    expect(result.state).toBe('not_ready')
  })

  it('is ready only when every gate passes from the current state', () => {
    const readyConfig = { ...config, destination_identity: { ...config.destination_identity, account_or_workspace_id_or_null: 'urn:li:organization:1' }, secure_connection: { connection_ref_or_null: 'c', connection_state: 'connected' as const }, connection_validation: { ...config.connection_validation, state: 'verified' as const }, readiness: { state: 'ready' as const, blockers: [], next_action: 'ok' } }
    const ready = evaluatePreflight({ ...base(), postVersion: approved(), contentApproval: contentApprovalCheck(approved()), consent: { state: 'valid', consent_ref_or_null: 'consent-1', bound_content_hash_or_null: contentHashOf(post()), bound_destination_or_null: 'x' }, config: readyConfig }, 'en', now)
    expect(ready.state).toBe('ready')
    expect(ready.check_results.every((r) => r.result === 'pass')).toBe(true)
  })

  it('fails scope on a platform mismatch, a second post or an unready CTA; format is unknown without an adapter and fails over the limit', () => {
    const mismatch = evaluatePreflight({ ...base(), post: post({ target: { ...post().target, channel: 'Discord hackathonu' } }) }, 'pl', now)
    expect(mismatch.check_results.find((r) => r.gate === 'scope')).toMatchObject({ result: 'fail' })
    const cta = evaluatePreflight({ ...base(), ctaPublicationReadiness: 'blocked' }, 'en', now)
    expect(cta.check_results.find((r) => r.gate === 'scope')?.detail).toContain('publication_readiness=blocked')
    const noAdapter = evaluatePreflight({ ...base(), adapter: null }, 'pl', now)
    expect(noAdapter.check_results.find((r) => r.gate === 'format')).toMatchObject({ result: 'unknown' })
    const long = evaluatePreflight({ ...base(), post: post({ text: 'x'.repeat(3001) }) }, 'pl', now)
    expect(long.check_results.find((r) => r.gate === 'format')).toMatchObject({ result: 'fail' })
  })

  it('fails version on a stale or needs_review version, no_hold on any hold, no_pending_attempt on a reserved, confirmed or unknown attempt', () => {
    expect(evaluatePreflight({ ...base(), postVersion: postVersion({ isCurrent: false }) }, 'pl', now).check_results.find((r) => r.gate === 'version')?.result).toBe('fail')
    expect(evaluatePreflight({ ...base(), postVersion: postVersion({ status: 'needs_review' }) }, 'pl', now).check_results.find((r) => r.gate === 'version')?.result).toBe('fail')
    expect(evaluatePreflight({ ...base(), hold: { state: 'client_hold', reason_or_null: 'r', request_ref_or_null: null } }, 'pl', now).check_results.find((r) => r.gate === 'no_hold')?.result).toBe('fail')
    for (const prior of ['confirmed_published', 'unknown'] as const) {
      expect(evaluatePreflight({ ...base(), guard: { reservation_state: 'none', prior_outcome: prior } }, 'pl', now).check_results.find((r) => r.gate === 'no_pending_attempt')?.result).toBe('fail')
    }
    expect(evaluatePreflight({ ...base(), guard: { reservation_state: 'reserved', prior_outcome: 'none' } }, 'pl', now).check_results.find((r) => r.gate === 'no_pending_attempt')?.result).toBe('fail')
    expect(evaluatePreflight({ ...base(), guard: { reservation_state: 'none', prior_outcome: 'confirmed_not_sent' } }, 'pl', now).check_results.find((r) => r.gate === 'no_pending_attempt')?.result).toBe('pass')
  })
})

describe('8.3 publication order and 8.7 confirmation (pure)', () => {
  const config = buildPublicationConfig({ order }, 'pl').data

  it('compiles the order from the pinned post: snapshot payload, hash, missing decisions, blocked preflight', () => {
    const { data, contentHash } = buildPublicationOrder({ orderRef: 'o', post: post(), postVersion: postVersion(), config, configVersion, adapter: adapterFor('LinkedIn'), now }, 'pl')
    expect(zleceniePublikacjiDataSchema.parse(data)).toBeTruthy()
    expect(data.post_ref).toEqual({ document_ref: 'KLI-POST@o', content_version: '1.0', content_hash: contentHash })
    expect(data.payload).toEqual({ text: TEXT, link_refs: ['https://makeitflow.pl/index.php'], mention_policy: 'no_mentions_unless_approved', platform_format: 'linkedin-company-post-text@0.1.0:text' })
    expect(data.destination).toMatchObject({ platform: 'LinkedIn', account_or_workspace_id_or_null: null, config_ref_or_null: 'WEW-KONFIG-PUBLIKACJI@o@1.0' })
    expect(data.content_approval_check.state).toBe('missing')
    expect(data.publication_consent_check.state).toBe('missing')
    expect(data.execution_guard).toMatchObject({ reservation_state: 'none', attempt_refs: [], prior_outcome: 'none' })
    expect(data.current_hold.state).toBe('none')
    expect(data.preflight.state).toBe('not_ready')
    expect(data.delivery_instruction).toEqual({ mode: 'immediate_after_valid_gates', requested_time_or_null: null })
  })

  it('carries an open escalation as a hold and a prior outcome into the guard', () => {
    const { data } = buildPublicationOrder({ orderRef: 'o', post: post(), postVersion: postVersion(), config, configVersion, adapter: null, openEscalationRef: 'WEW-ESKALACJA@o@1.0', priorOutcome: 'unknown', now }, 'en')
    expect(data.current_hold).toEqual({ state: 'exception', reason_or_null: 'An open E.1 exception on the order.', request_ref_or_null: 'WEW-ESKALACJA@o@1.0' })
    expect(data.execution_guard.prior_outcome).toBe('unknown')
    expect(data.payload.platform_format).toBe('text')
    expect(data.preflight.check_results.find((r) => r.gate === 'no_hold')?.result).toBe('fail')
    expect(data.preflight.check_results.find((r) => r.gate === 'no_pending_attempt')?.result).toBe('fail')
    const confirmation = buildPublicationConfirmation({ order: data, orderRef: { document_id: 'WEW-ZLECENIE-PUBLIKACJI@o', version: '1.0' } }, 'en')
    expect(confirmation.failure_details.code_or_null).toBe('ON_HOLD')
    expect(confirmation.recovery.exception_ref_or_null).toBe('WEW-ESKALACJA@o@1.0')
  })

  it('records a not_executed outcome with every external field null and retry forbidden', () => {
    const { data } = buildPublicationOrder({ orderRef: 'o', post: post(), postVersion: postVersion(), config, configVersion, adapter: adapterFor('LinkedIn'), now }, 'pl')
    const confirmation = buildPublicationConfirmation({ order: data, orderRef: { document_id: 'WEW-ZLECENIE-PUBLIKACJI@o', version: '1.0' } }, 'pl')
    expect(potwierdzeniePublikacjiDataSchema.parse(confirmation)).toBeTruthy()
    expect(confirmation.outcome).toBe('not_executed')
    expect(confirmation.execution_ref).toEqual({ publication_order_ref: 'WEW-ZLECENIE-PUBLIKACJI@o@1.0', attempt_id_or_null: null, reservation_key_or_null: null })
    expect(confirmation.approved_material_ref).toMatchObject({ post_ref: 'KLI-POST@o', content_version: '1.0', content_hash: data.post_ref.content_hash, content_approval_ref_or_null: null, publication_consent_ref_or_null: null })
    expect(confirmation.external_artifact).toEqual({ external_post_id_or_null: null, verified_url_or_null: null, published_at_or_null: null })
    expect(confirmation.proof).toEqual({ method: 'none', evidence_ref_or_null: null, verified_at_or_null: null, content_match_state: 'not_checked' })
    expect(confirmation.failure_details.code_or_null).toBe('GATES_NOT_MET')
    expect(confirmation.failure_details.sanitized_message_or_null).toContain('content_approval')
    expect(confirmation.recovery).toMatchObject({ next_action: 'obtain_missing_gates', retry_allowed: false, exception_ref_or_null: null })
    expect(confirmation.client_receipt).toBeNull()
    const md = renderPotwierdzeniePublikacji({ outputLanguage: 'pl', brand: order.brand, data: confirmation, issues: [] })
    expect(md).toContain('not_executed')
    const view = renderPotwierdzeniePublikacjiClientView({ outputLanguage: 'en', brand: order.brand, data: confirmation })
    expect(view.markdown).toContain('was not executed')
    expect(view.markdown).not.toMatch(/https?:\/\//)
    const orderMd = renderZleceniePublikacji({ outputLanguage: 'pl', brand: order.brand, data, issues: [] })
    expect(orderMd).toContain('| content_approval | fail |')
    const orderView = renderZleceniePublikacjiClientView({ outputLanguage: 'pl', brand: order.brand, data })
    expect(orderView.markdown).toContain(TEXT)
    expect(orderView.markdown).not.toContain('idempot')
  })
})

describe('8.x steps over the store', () => {
  type Stored = InputVersion & { versionId: string; data: unknown }
  const mocked = store as jest.Mocked<typeof store>
  const ctxOf = (em: unknown): StepContext =>
    ({
      em, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0', status: 'approved' },
      runAgent: async () => { throw new Error('no agent calls in P8') }, runner: 'fixture', models: { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }, ledger: createLedger({ prices: {} }),
      onEvent: () => {}, log: () => {}, agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    }) as unknown as StepContext

  function arrange(documents: Partial<Record<TemplateId, Stored>>, versionRow: { approvalRecords: unknown } | null = null) {
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => documents[templateId] ?? null)
    mocked.startTaskRun.mockResolvedValue({ id: 'run-8' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    mocked.saveDocumentVersion.mockImplementation(async (_em, _scope, input) => ({ document: { id: 'doc' }, version: { id: `v-${input.templateId}` }, envelope: { document_id: `${input.templateId}@o`, version: '1.0', status: input.status } }) as never)
    const em = { findOne: jest.fn(async () => versionRow), flush: jest.fn() }
    return { em, ctx: ctxOf(em) }
  }

  beforeEach(() => jest.clearAllMocks())

  it('8.2 saves WEW-KONFIG-PUBLIKACJI as blocked with one issue per blocker', async () => {
    const { em, ctx } = arrange({})
    const outcome = await runPublicationConfigStep(ctx)
    expect(outcome).toEqual({ taskRunId: 'run-8', versionId: 'v-WZR-KONFIG-PUBLIKACJI', status: 'done' })
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved).toMatchObject({ templateId: 'WZR-KONFIG-PUBLIKACJI', status: 'blocked', inputVersions: [ctx.orderVersion] })
    expect(saved.issues.map((i) => i.code)).toEqual(['NO_DESTINATION_ID', 'NO_CONNECTION', 'NOT_VALIDATED'])
    expect(saved.clientViewMd).toContain('not_ready')
    expect(mocked.startTaskRun).toHaveBeenCalledWith(em, ctx.scope, expect.objectContaining({ stepId: '8.2', runner: 'fixture', models: {} }))
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-8' }, expect.objectContaining({ status: 'done', outputVersionId: 'v-WZR-KONFIG-PUBLIKACJI' }))
  })

  it('8.3 refuses without a post or a configuration, and records the failed run', async () => {
    const { ctx } = arrange({ 'WZR-POST': { document_id: 'KLI-POST@o', version: '1.0', status: 'ready_for_review', versionId: 'vp', data: post() } })
    await expect(runPublicationOrderStep(ctx)).rejects.toThrow('8.3 needs')
    expect(mocked.startTaskRun).not.toHaveBeenCalled()
  })

  it('8.3 pins post and configuration, reads approval records off the version row, flags simulation and every failed gate, saves blocked', async () => {
    const config = buildPublicationConfig({ order }, 'pl').data
    const { em, ctx } = arrange(
      {
        'WZR-POST': { document_id: 'KLI-POST@o', version: '2.0', status: 'ready_for_review', versionId: 'vp', data: post() },
        'WZR-KONFIG-PUBLIKACJI': { document_id: 'WEW-KONFIG-PUBLIKACJI@o', version: '1.0', status: 'blocked', versionId: 'vc', data: config },
        'WZR-ESKALACJA': { document_id: 'WEW-ESKALACJA@o', version: '1.0', status: 'blocked', versionId: 've', data: { resolution: { state: 'open', selected_code_or_null: null, actor_ref_or_null: null, rationale_or_null: null, evidence_refs: [] } } },
      },
      { approvalRecords: [] },
    )
    const outcome = await runPublicationOrderStep(ctx)
    expect(outcome.status).toBe('done')
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), { id: 'vp' })
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved.templateId).toBe('WZR-ZLECENIE-PUBLIKACJI')
    expect(saved.status).toBe('blocked')
    expect(saved.simulation).toBe(true)
    expect(saved.inputVersions.map((v) => v.document_id)).toEqual(['WEW-DANE-ZAMOWIENIA@o', 'KLI-POST@o', 'WEW-KONFIG-PUBLIKACJI@o'])
    const data = zleceniePublikacjiDataSchema.parse(saved.data)
    expect(data.post_ref.content_version).toBe('2.0')
    expect(data.content_approval_check.state).toBe('missing')
    expect(data.current_hold.state).toBe('exception')
    const codes = saved.issues.map((i) => i.code)
    expect(codes).toContain('SIMULATED_INPUT')
    expect(codes).toEqual(expect.arrayContaining(['PREFLIGHT_CONTENT_APPROVAL', 'PREFLIGHT_PUBLICATION_CONSENT', 'PREFLIGHT_DESTINATION', 'PREFLIGHT_ACCESS', 'PREFLIGHT_NO_HOLD']))
    expect(codes).not.toContain('PREFLIGHT_FORMAT')
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-8' }, expect.objectContaining({ status: 'done', summary: expect.objectContaining({ preflight: 'not_ready', hold: 'exception' }) }))
  })

  it('8.3 treats an approved version with a matching approval record as valid content approval — consent still missing', async () => {
    const config = buildPublicationConfig({ order }, 'pl').data
    const { ctx } = arrange(
      {
        'WZR-POST': { document_id: 'KLI-POST@o', version: '1.0', status: 'approved', versionId: 'vp', data: post() },
        'WZR-KONFIG-PUBLIKACJI': { document_id: 'WEW-KONFIG-PUBLIKACJI@o', version: '1.0', status: 'blocked', versionId: 'vc', data: config },
        'WZR-POTWIERDZENIE-PUBLIKACJI': { document_id: 'WEW-POTWIERDZENIE-PUBLIKACJI@o', version: '1.0', status: 'blocked', versionId: 'vk', data: { ...buildPublicationConfirmation({ order: buildPublicationOrder({ orderRef: 'o', post: post(), postVersion: postVersion(), config, configVersion, adapter: null }, 'pl').data, orderRef: { document_id: 'WEW-ZLECENIE-PUBLIKACJI@o', version: '1.0' } }, 'pl') } },
      },
      { approvalRecords: [{ person: 'client-1', at: '2026-09-20T09:00:00.000Z', scope: 'content', version: '1.0' }] },
    )
    await runPublicationOrderStep(ctx)
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved.simulation).toBe(false)
    const data = zleceniePublikacjiDataSchema.parse(saved.data)
    expect(data.content_approval_check.state).toBe('valid')
    expect(data.publication_consent_check.state).toBe('missing')
    expect(data.execution_guard.prior_outcome).toBe('not_executed')
    expect(data.preflight.check_results.find((r) => r.gate === 'no_pending_attempt')?.result).toBe('pass')
    expect(saved.issues.map((i) => i.code)).not.toContain('SIMULATED_INPUT')
  })

  it('8.7 needs an order, then saves WEW-POTWIERDZENIE-PUBLIKACJI as blocked / not_executed with a closure-blocking issue', async () => {
    const config = buildPublicationConfig({ order }, 'pl').data
    const orderData = buildPublicationOrder({ orderRef: 'o', post: post(), postVersion: postVersion(), config, configVersion, adapter: adapterFor('LinkedIn'), now }, 'pl').data
    const missing = arrange({})
    await expect(runPublicationConfirmationStep(missing.ctx)).rejects.toThrow('8.7 needs')
    const { em, ctx } = arrange({
      'WZR-ZLECENIE-PUBLIKACJI': { document_id: 'WEW-ZLECENIE-PUBLIKACJI@o', version: '1.0', status: 'blocked', versionId: 'vo', data: orderData },
      'WZR-POST': { document_id: 'KLI-POST@o', version: '1.0', status: 'ready_for_review', versionId: 'vp', data: post() },
    })
    const outcome = await runPublicationConfirmationStep(ctx)
    expect(outcome).toEqual({ taskRunId: 'run-8', versionId: 'v-WZR-POTWIERDZENIE-PUBLIKACJI', status: 'done' })
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved).toMatchObject({ templateId: 'WZR-POTWIERDZENIE-PUBLIKACJI', status: 'blocked', simulation: true })
    const data = potwierdzeniePublikacjiDataSchema.parse(saved.data)
    expect(data.outcome).toBe('not_executed')
    expect(data.external_artifact.verified_url_or_null).toBeNull()
    expect(saved.issues.map((i) => [i.code, i.severity])).toEqual(expect.arrayContaining([['PUBLICATION_NOT_EXECUTED', 'blocking_closure'], ['SIMULATED_INPUT', 'limitation']]))
    expect(mocked.startTaskRun).toHaveBeenCalledWith(em, ctx.scope, expect.objectContaining({ stepId: '8.7', inputVersions: expect.arrayContaining([expect.objectContaining({ document_id: 'WEW-ZLECENIE-PUBLIKACJI@o' }), expect.objectContaining({ document_id: 'KLI-POST@o' })]) }))
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(em, { id: 'run-8' }, expect.objectContaining({ status: 'done', summary: { outcome: 'not_executed', failure_code: 'GATES_NOT_MET', retry_allowed: false } }))
  })
})
