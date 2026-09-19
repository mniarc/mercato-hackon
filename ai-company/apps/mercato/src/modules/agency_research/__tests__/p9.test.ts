import type { AudytData } from '../data/schemas/audyt'
import type { BriefData } from '../data/schemas/brief'
import type { KonkurencjaData } from '../data/schemas/konkurencja'
import type { PakietData } from '../data/schemas/pakiet'
import type { PotwierdzeniePublikacjiData } from '../data/schemas/potwierdzeniePublikacji'
import type { StrategiaData } from '../data/schemas/strategia'
import type { ZrodlaData } from '../data/schemas/zrodla'
import { outputIdByTemplate } from '../data/schemas/envelope'
import { orderDataSchema, orderFactsOf } from '../data/schemas/zamowienie'
import { createLedger } from '../lib/research/ledger'
import { auditTakeawaysOf, buildManifest, buildPackage, closureGateOf, completionCheckOf, limitationsOf, notExecutedDelivery, paymentVerifiedOf, type PackagedDocument, type PackageInputs } from '../lib/research/packaging'
import { renderPakiet, renderPakietClientView } from '../lib/research/render/pakiet'
import { runClosureStep } from '../lib/research/steps/closure'
import type { StepContext } from '../lib/research/steps/context'
import { runPackageStep } from '../lib/research/steps/package'
import * as store from '../lib/store'

jest.mock('../lib/store', () => {
  const actual = jest.requireActual('../lib/store')
  return { ...actual, startTaskRun: jest.fn(), finishTaskRun: jest.fn(), saveDocumentVersion: jest.fn(), currentInputVersion: jest.fn() }
})

const order = orderFactsOf(
  orderDataSchema.parse({
    product_selection: { sku: 'START-KOMUNIKACJI-PL-01', offer_version: 'v1', price_net: 2500, currency: 'PLN' },
    brand: { display_name: 'FLOW Centrum Badawcze', website_url: 'https://makeitflow.pl/index.php' },
    market_language: { market: 'Polska', language: 'pl' },
    official_social: { url: 'https://www.linkedin.com/company/flow-centrum-badawcze/', platform: 'LinkedIn', provenance: 'client_provided' },
  }),
)

const gap = (gap_id: string, priority: 'must' | 'should', observation: string): AudytData['gaps'][number] => ({
  gap_id, observation, business_impact_hypothesis: null, evidence_ids: ['F01'], priority, needed: 'decyzja', destination: 'KLI-STRATEGIA.strategic_choice', finding_type: 'pending_decision', consequence_for_work: 'nie ustalamy za klienta',
})

const audyt = (gaps: AudytData['gaps']) => ({ gaps }) as unknown as AudytData
const konkurencja = (implications: KonkurencjaData['implications']) => ({ implications }) as unknown as KonkurencjaData
const implication = (finding: string): KonkurencjaData['implications'][number] => ({ finding, limitation: 'porównanie tylko z materiałów publicznych', strategy_field: 'uvp', client_answer_needed: null, evidence_ids: ['F02'] })
const strategia = (baseline: string | null, assumptions: string[] = []) =>
  ({ measurement_hypothesis: { baseline }, creative_boundaries: { open_assumptions: assumptions } }) as unknown as StrategiaData
const brief = (assumptions: BriefData['open_assumptions']) => ({ open_assumptions: assumptions }) as unknown as BriefData
const zrodla = (coverage: ZrodlaData['coverage']) => ({ coverage }) as unknown as ZrodlaData
const potwierdzenie = (outcome: PotwierdzeniePublikacjiData['outcome'], url: string | null = null) => ({ outcome, external_artifact: { external_post_id_or_null: null, verified_url_or_null: url, published_at_or_null: null } }) as unknown as PotwierdzeniePublikacjiData

const doc = (id: string, data: unknown, status = 'approved', simulation = false): PackagedDocument => ({ document_id: `${id}@o`, version: '1.0', status, simulation, data })

function fullDocuments(overrides: Partial<PackageInputs['documents']> = {}): PackageInputs['documents'] {
  return {
    brief: doc('KLI-BRIEF', brief([])),
    strategia: doc('KLI-STRATEGIA', strategia('brak danych o ruchu — poziom zerowy', [])),
    tov: doc('KLI-TOV', {}),
    plan: doc('KLI-PLAN', {}),
    post: doc('KLI-POST', {}),
    audyt: doc('WEW-AUDYT', audyt([gap('G01', 'must', 'Strona nie wskazuje priorytetowej usługi.'), gap('G02', 'should', 'Brak jednego wezwania do kontaktu.')]), 'ready_for_review'),
    konkurencja: doc('WEW-KONKURENCJA', konkurencja([implication('Konkurenci opisują proces badań szerzej.')]), 'ready_for_review'),
    zrodla: doc('WEW-ZRODLA', zrodla([]), 'ready_for_review'),
    potwierdzenie: doc('WEW-POTWIERDZENIE-PUBLIKACJI', potwierdzenie('confirmed_published', 'https://www.linkedin.com/posts/flow-1'), 'approved'),
    ...overrides,
  }
}

const inputs = (documents: PackageInputs['documents'], extra: Partial<PackageInputs> = {}): PackageInputs => ({
  brand: 'FLOW', sku: 'START-KOMUNIKACJI-PL-01', offerVersion: 'v1', outputLanguage: 'pl', documents, paymentVerified: true, openEscalationRefs: [], ...extra,
})

const deliveredDelivery: PakietData['delivery'] = { state: 'delivered', channel_or_null: 'portal', recipient_ref_or_null: 'contact-1', delivered_at_or_null: '2026-09-20T10:00:00.000Z', delivery_evidence_ref_or_null: 'share-event-1' }

describe('P9 — manifest', () => {
  it('lists every purchased result with its version, and names a missing one instead of summarising it', () => {
    const rows = buildManifest(inputs(fullDocuments({ plan: null })))
    expect(rows.map((r) => r.kind)).toEqual(['brief', 'strategy', 'tov', 'plan', 'post', 'audit_takeaways', 'publication_proof'])
    expect(rows.find((r) => r.kind === 'brief')).toMatchObject({ document_ref: 'KLI-BRIEF@o', content_version: '1.0', approval_state: 'approved', availability_state: 'available' })
    expect(rows.find((r) => r.kind === 'plan')).toMatchObject({ approval_state: 'not_applicable', availability_state: 'not_available', content_version: 'none' })
    expect(rows.find((r) => r.kind === 'publication_proof')).toMatchObject({ document_ref: 'WEW-POTWIERDZENIE-PUBLIKACJI@o', availability_state: 'available' })
  })

  it('maps document statuses onto approval states and blocks the proof row when the publication is not confirmed', () => {
    const rows = buildManifest(inputs(fullDocuments({ tov: doc('KLI-TOV', {}, 'ready_for_review'), post: doc('KLI-POST', {}, 'simulated_accepted'), potwierdzenie: doc('WEW-POTWIERDZENIE-PUBLIKACJI', potwierdzenie('not_executed')) })))
    expect(rows.find((r) => r.kind === 'tov')?.approval_state).toBe('ready_for_review')
    expect(rows.find((r) => r.kind === 'post')?.approval_state).toBe('simulated_accepted')
    expect(rows.find((r) => r.kind === 'publication_proof')?.availability_state).toBe('blocked')
    expect(rows.find((r) => r.kind === 'audit_takeaways')?.availability_state).toBe('available')
  })
})

describe('P9 — takeaways and limitations', () => {
  it('projects 3–5 verified findings with source references, must gaps first, and caps at five', () => {
    const many = audyt([gap('G03', 'should', 'c'), gap('G01', 'must', 'a'), gap('G02', 'must', 'b')])
    const { rows, issues } = auditTakeawaysOf({ audyt: many, konkurencja: konkurencja([implication('i1'), implication('i2'), implication('i3')]), strategia: strategia('x'), outputLanguage: 'pl' })
    expect(issues).toEqual([])
    expect(rows).toHaveLength(5)
    expect(rows.slice(0, 3).map((r) => r.source_finding_ref)).toEqual(['WEW-AUDYT.gaps.G01', 'WEW-AUDYT.gaps.G02', 'WEW-AUDYT.gaps.G03'])
    expect(rows[3]).toMatchObject({ finding: 'i1', source_finding_ref: 'WEW-KONKURENCJA.implications[0]', limitation: 'porównanie tylko z materiałów publicznych' })
  })

  it('flags fewer than three takeaways as a 3.7 gap and adds the missing-analytics note when the strategy has no baseline', () => {
    const { rows, issues } = auditTakeawaysOf({ audyt: audyt([gap('G01', 'must', 'a')]), konkurencja: null, strategia: strategia(null), outputLanguage: 'pl' })
    expect(rows).toHaveLength(1)
    expect(issues.map((i) => i.code)).toEqual(['AUDIT_TAKEAWAYS_SHORT'])
    expect(rows[0].limitation).toMatch(/analityki wewnętrznej/)
  })

  it('collects limitations from open brief assumptions, strategy boundaries, register gaps and the missing baseline', () => {
    const assumption = (id: string, state: 'open' | 'confirmed'): BriefData['open_assumptions'][number] => ({ assumption_id: id, text: `t ${id}`, type: 'hypothesis', impact: 'priority_offer', decision_owner: 'klient', allowed_use: 'p', logical_deadline: 'd', state })
    const coverage: ZrodlaData['coverage'] = [
      { item_type: 'requirement_coverage', requirement: 'dowód', readiness: 'blocked', evidence_ids: [], gap: 'brak mierzonych wyników', owner: 'klient' },
      { item_type: 'requirement_coverage', requirement: 'oferta', readiness: 'ready', evidence_ids: ['F01'], gap: null, owner: 'none' },
    ]
    const rows = limitationsOf({ brief: brief([assumption('A-01', 'open'), assumption('A-02', 'confirmed')]), strategia: strategia(null, ['ceny po diagnozie — do potwierdzenia']), zrodla: zrodla(coverage), outputLanguage: 'en' })
    expect(rows.map((r) => r.source_ref)).toEqual(['KLI-BRIEF.open_assumptions.A-01', 'KLI-STRATEGIA.creative_boundaries.open_assumptions[0]', 'WEW-ZRODLA.coverage.dowód', 'KLI-STRATEGIA.measurement_hypothesis.baseline'])
  })
})

describe('P9 — completion and closure', () => {
  it('is complete only when every deliverable is available, approved, real and published, with no open escalation', () => {
    const documents = fullDocuments()
    const complete = completionCheckOf({ manifest: buildManifest(inputs(documents)), documents, publicationOutcome: 'confirmed_published', openEscalationRefs: [], outputLanguage: 'pl' })
    expect(complete).toMatchObject({ state: 'complete', blockers: [], required_items: ['brief', 'strategy', 'tov', 'plan', 'post', 'audit_takeaways', 'publication_proof'] })
  })

  it('names simulation, an unexecuted publication, a missing deliverable and an open escalation as blockers', () => {
    const documents = fullDocuments({ strategia: doc('KLI-STRATEGIA', strategia('x'), 'ready_for_review', true), plan: null, potwierdzenie: doc('WEW-POTWIERDZENIE-PUBLIKACJI', potwierdzenie('not_executed')) })
    const check = completionCheckOf({ manifest: buildManifest(inputs(documents)), documents, publicationOutcome: 'not_executed', openEscalationRefs: ['WEW-ESKALACJA@o v1.0'], outputLanguage: 'pl' })
    expect(check.state).toBe('incomplete')
    expect(check.blockers).toEqual(expect.arrayContaining([expect.stringMatching(/^plan: brak/), expect.stringMatching(/^publication_proof:/), expect.stringMatching(/KLI-STRATEGIA@o: wersja zbudowana/), expect.stringMatching(/otwarta eskalacja: WEW-ESKALACJA@o/)]))
  })

  it('closes only on the single all-true path and reads payment off the purchase record', () => {
    const documents = fullDocuments()
    const completion = completionCheckOf({ manifest: buildManifest(inputs(documents)), documents, publicationOutcome: 'confirmed_published', openEscalationRefs: [], outputLanguage: 'pl' })
    const open = closureGateOf({ paymentVerified: true, completion, publicationOutcome: 'confirmed_published', delivery: deliveredDelivery })
    expect(open).toEqual({ payment_verified: true, completion_passed: true, publication_verified: true, delivery_verified: true, open_blockers: false, close_allowed: true })
    expect(closureGateOf({ paymentVerified: false, completion, publicationOutcome: 'confirmed_published', delivery: deliveredDelivery }).close_allowed).toBe(false)
    expect(closureGateOf({ paymentVerified: true, completion, publicationOutcome: 'unknown', delivery: deliveredDelivery }).close_allowed).toBe(false)
    expect(closureGateOf({ paymentVerified: true, completion, publicationOutcome: 'confirmed_published', delivery: notExecutedDelivery }).close_allowed).toBe(false)
    expect(closureGateOf({ paymentVerified: true, completion, publicationOutcome: 'confirmed_published', delivery: { ...deliveredDelivery, delivery_evidence_ref_or_null: null } }).delivery_verified).toBe(false)
    expect(closureGateOf({ paymentVerified: true, completion: { ...completion, state: 'incomplete', blockers: ['x'] }, publicationOutcome: 'confirmed_published', delivery: deliveredDelivery })).toMatchObject({ completion_passed: false, open_blockers: true, close_allowed: false })
    expect(paymentVerifiedOf({ terms_confirmation: { payment_state: 'paid' } })).toBe(true)
    expect(paymentVerifiedOf({ billing: { payment_state: 'pending' } })).toBe(false)
    expect(paymentVerifiedOf(undefined)).toBe(false)
  })
})

describe('P9 — package assembly and rendering', () => {
  it('assembles a contract-valid package whose identity, receipt and issues follow the checks', () => {
    const complete = buildPackage(inputs(fullDocuments(), { delivery: deliveredDelivery }))
    expect(complete.issues).toEqual([])
    expect(complete.data.package_identity).toMatchObject({ purchased_sku: 'START-KOMUNIKACJI-PL-01', realization_state: 'delivered' })
    expect(complete.data.publication_receipt_ref).toEqual({ receipt_ref: 'WEW-POTWIERDZENIE-PUBLIKACJI@o', outcome: 'confirmed_published', verified_url_or_null: 'https://www.linkedin.com/posts/flow-1' })
    expect(complete.data.closure_gate.close_allowed).toBe(true)
    expect(complete.data.how_to_use).toHaveLength(3)
    expect(complete.data.next_contact?.length).toBeLessThanOrEqual(250)

    const preparing = buildPackage(inputs(fullDocuments({ potwierdzenie: doc('WEW-POTWIERDZENIE-PUBLIKACJI', potwierdzenie('not_executed', 'https://should-not-leak')), post: doc('KLI-POST', {}, 'ready_for_review', true) })))
    expect(preparing.data.package_identity.realization_state).toBe('preparing')
    expect(preparing.data.publication_receipt_ref.verified_url_or_null).toBeNull()
    expect(preparing.data.closure_gate.close_allowed).toBe(false)
    expect(preparing.issues.map((i) => i.code)).toEqual(['PACKAGE_INCOMPLETE'])
  })

  it('renders a client view with document references only and an internal view with the gate', () => {
    const { data, issues } = buildPackage(inputs(fullDocuments()))
    const view = renderPakietClientView({ outputLanguage: 'pl', brand: 'FLOW', data })
    expect(view.issue).toBeNull()
    expect(view.markdown).toContain('KLI-STRATEGIA@o')
    expect(view.markdown).toContain('opublikowano — link: https://www.linkedin.com/posts/flow-1')
    expect(view.markdown).not.toMatch(/WEW-AUDYT\.gaps|close_allowed|F01/)
    const internal = renderPakiet({ outputLanguage: 'en', brand: 'FLOW', data, issues })
    expect(internal).toContain('close_allowed=false')
    expect(internal).toContain('WEW-AUDYT.gaps.G01')
  })
})

describe('P9 — steps', () => {
  const versions: Record<string, { data: unknown; status: string; simulation?: boolean }> = {}
  const mocked = store as jest.Mocked<typeof store>
  const stored: { versionId: string; simulationFlag: boolean }[] = []

  function ctxOf(): StepContext {
    const em = { findOne: async (_entity: unknown, where: { id: string }) => stored.find((v) => v.versionId === where.id) ?? null, flush: jest.fn() }
    return {
      em, scope: { tenantId: 't', organizationId: 'o' }, orderRef: 'o', order, orderVersion: { document_id: 'WEW-DANE-ZAMOWIENIA@o', version: '1.0', status: 'approved' },
      runAgent: async () => { throw new Error('no agents in P9') }, runner: 'fixture', models: { extract: 'fixture', synthesis: 'fixture', qa: 'fixture' }, ledger: createLedger({ prices: {} }), onEvent: () => {}, log: () => {},
      agentRunIds: [], taskRunIds: [], documentVersionIds: [], fetchPage: async () => { throw new Error('no fetch') }, repairFindings: [], attempt: 1,
    } as unknown as StepContext
  }

  beforeEach(() => {
    for (const key of Object.keys(versions)) delete versions[key]
    stored.length = 0
    jest.clearAllMocks()
    mocked.currentInputVersion.mockImplementation(async (_em, _scope, _orderRef, templateId) => {
      const row = versions[templateId]
      if (!row) return null
      const versionId = `v-${templateId}`
      stored.push({ versionId, simulationFlag: row.simulation ?? false })
      return { document_id: `${outputIdByTemplate[templateId]}@o`, version: '1.0', status: row.status, versionId, data: row.data }
    })
    mocked.startTaskRun.mockResolvedValue({ id: 'run-91' } as never)
    mocked.finishTaskRun.mockResolvedValue(undefined)
    mocked.saveDocumentVersion.mockImplementation(async (_em, _scope, input) => ({ version: { id: 'v-pakiet-new' }, document: {}, envelope: { document_id: 'KLI-PAKIET@o', version: '1.0', status: input.status } }) as never)
  })

  it('9.1 pins every present input, reads the simulation flag off the stored version and saves a draft package with the blockers', async () => {
    versions['WZR-ZAMOWIENIE'] = { data: { product_selection: { offer_version: 'v1' }, terms_confirmation: { payment_state: 'paid' } }, status: 'approved' }
    versions['WZR-BRIEF'] = { data: brief([]), status: 'ready_for_review', simulation: false }
    versions['WZR-STRATEGIA'] = { data: strategia('b'), status: 'ready_for_review', simulation: true }
    versions['WZR-AUDYT'] = { data: audyt([gap('G01', 'must', 'a'), gap('G02', 'must', 'b'), gap('G03', 'should', 'c')]), status: 'ready_for_review' }
    versions['WZR-KONKURENCJA'] = { data: konkurencja([]), status: 'ready_for_review' }
    versions['WZR-ESKALACJA'] = { data: { resolution: { state: 'open' } }, status: 'blocked' }
    const ctx = ctxOf()
    const outcome = await runPackageStep(ctx)
    expect(outcome).toMatchObject({ taskRunId: 'run-91', versionId: 'v-pakiet-new', status: 'done' })
    expect(outcome.data.completion_check.state).toBe('incomplete')
    expect(outcome.data.completion_check.blockers).toEqual(expect.arrayContaining([expect.stringMatching(/^tov: brak/), expect.stringMatching(/KLI-STRATEGIA@o: wersja zbudowana/), expect.stringMatching(/^KLI-BRIEF@o: status ready_for_review/), expect.stringMatching(/otwarta eskalacja: WEW-ESKALACJA@o v1.0/)]))
    expect(outcome.data.closure_gate).toMatchObject({ payment_verified: true, close_allowed: false })
    expect(outcome.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['PACKAGE_INCOMPLETE', 'SIMULATED_INPUT']))
    const saved = mocked.saveDocumentVersion.mock.calls[0][2]
    expect(saved).toMatchObject({ templateId: 'WZR-PAKIET', status: 'draft', simulation: true, taskRunId: 'run-91' })
    expect(saved.inputVersions.map((v) => v.document_id)).toEqual(expect.arrayContaining(['WEW-DANE-ZAMOWIENIA@o', 'KLI-BRIEF@o', 'KLI-STRATEGIA@o', 'WEW-AUDYT@o']))
    expect(mocked.finishTaskRun).toHaveBeenCalledWith(ctx.em, { id: 'run-91' }, expect.objectContaining({ status: 'done', outputVersionId: 'v-pakiet-new', summary: expect.objectContaining({ completion: 'incomplete', close_allowed: false }) }))
    expect(ctx.documentVersionIds).toEqual(['v-pakiet-new'])
  })

  it('9.3 re-evaluates the gate from the current package and records the reasons without mutating anything', async () => {
    const complete = buildPackage(inputs(fullDocuments(), { delivery: deliveredDelivery }))
    versions['WZR-ZAMOWIENIE'] = { data: { terms_confirmation: { payment_state: 'paid' } }, status: 'approved' }
    versions['WZR-PAKIET'] = { data: complete.data, status: 'ready_for_review' }
    const ctx = ctxOf()
    const allowed = await runClosureStep(ctx)
    expect(allowed).toMatchObject({ closeAllowed: true, reasons: [], versionId: 'v-WZR-PAKIET', status: 'done' })
    expect(mocked.finishTaskRun).toHaveBeenLastCalledWith(ctx.em, { id: 'run-91' }, expect.objectContaining({ status: 'done', qaResult: expect.objectContaining({ close_allowed: true, reasons: [] }) }))
    expect(mocked.saveDocumentVersion).not.toHaveBeenCalled()

    versions['WZR-ZAMOWIENIE'] = { data: {}, status: 'approved' }
    versions['WZR-PAKIET'] = { data: { ...complete.data, delivery: notExecutedDelivery }, status: 'ready_for_review' }
    const blocked = await runClosureStep(ctxOf())
    expect(blocked.closeAllowed).toBe(false)
    expect(blocked.reasons).toEqual(['payment_not_verified', 'delivery_not_verified'])
  })

  it('9.3 refuses to run without a package', async () => {
    await expect(runClosureStep(ctxOf())).rejects.toThrow(/9\.3 needs a current KLI-PAKIET/)
  })
})
