import { zrodlaDataSchema, type ZrodlaData } from '../../data/schemas/zrodla'
import type { OrderFacts } from '../../data/schemas/zamowienie'
import { ustaleniaDataSchema, type UstaleniaData } from '../../data/schemas/ustalenia'
import { pageExtractorResult, type PageExtraction } from '../../data/validators'
import { limits } from '../../data/templates'
import { RESEARCH_PAGE_EXTRACTOR_AGENT_ID } from '../agentIds'
import { chunkMarkdown, type CollectedSource } from '../research/fetch'
import { gatePageExtraction } from '../research/gate'
import { factId, sampleId, signalId, sourceId } from '../research/ids'
import type { StepFn } from '../research/pipeline'
import { quoteOffset } from '../research/util'
import type { MaterialRevisionRequest } from './contracts'

const nextIndex = (ids: string[], pattern: RegExp): number => Math.max(0, ...ids.map((id) => Number(pattern.exec(id)?.[1] ?? 0)))

/** Append only: previously cited IDs, permissions and interpretations never move. */
export async function appendMaterialEvidence(input: { existing: ZrodlaData; order: OrderFacts; request: MaterialRevisionRequest; step: StepFn; reservedSourceIds?: string[] }) {
  const data = zrodlaDataSchema.parse(input.existing)
  const { material } = input.request
  const original = material.text?.trim() || null
  const text = original?.slice(0, limits.research.maxTotalChars) || null
  const id = sourceId(nextIndex([...data.sources.map((source) => source.source_id), ...(input.reservedSourceIds ?? [])], /^S-(\d+)$/))
  const source: CollectedSource = {
    source_id: id, url: `attachment://${material.attachmentId}`, publisher: input.order.brand,
    kind: 'client supplied material', channel: 'file', origin: 'client', source_visibility: 'client_private',
    access: !text ? 'unavailable' : text.length < original!.length ? 'partial' : 'full',
    title: material.fileName, text, bytes: text?.length ?? 0, retrieved_at: new Date().toISOString(), published_at: null,
    read_scope: `${text ? `${text.length} extracted chars read` : 'not read'}; submission ${material.submissionId}; uploaded ${material.submittedAt}`,
    limitation: !text ? 'native attachment text extraction unavailable' : text.length < original!.length ? 'limited by the order text cap' : null,
  }
  const materialId = `attachment:${material.attachmentId}`
  data.sources.push({ source_id: id, canonical_source_id: id, independent_material_id: text ? materialId : null,
    url_or_file: source.url, publisher: source.publisher, kind: text ? source.kind : 'access_attempt', title: source.title,
    retrieved_at: source.retrieved_at, published_at: null, access: source.access, read_scope: source.read_scope,
    limitation: source.limitation, source_visibility: 'client_private', duplicate_of: null, origin: 'client' })
  let factIndex = nextIndex(data.facts.map((fact) => fact.fact_id), /^F(\d+)$/)
  let sampleIndex = nextIndex(data.language_samples.map((sample) => sample.sample_id), /^L(\d+)$/)
  let signalIndex = nextIndex(data.audience_signals.map((signal) => signal.signal_id), /^A(\d+)$/)
  const newFactIds: string[] = []
  const chunks = text ? chunkMarkdown(text) : []
  for (const [index, chunk] of chunks.entries()) {
    const extracted = await input.step<PageExtraction>({
      step: '4.5', agentId: RESEARCH_PAGE_EXTRACTOR_AGENT_ID, label: `${id}#${index + 1}/${chunks.length}`,
      input: { order: { brand: input.order.brand, market: input.order.market, language: input.order.language, websiteUrl: input.order.websiteUrl, purchaseGoal: input.order.purchaseGoal },
        entity: 'client', page: { source_id: id, url: source.url, publisher: source.publisher, channel: 'file', origin: 'client', chunk: { index, total: chunks.length }, content_md: chunk }, outputLanguage: input.order.outputLanguage },
      parse: (raw) => pageExtractorResult.parse(raw).data,
      gate: (value) => gatePageExtraction(value, chunk, id),
    })
    const refs = new Map<string, string>()
    for (const fact of extracted.value.facts) {
      const newId = factId(factIndex++)
      refs.set(fact.local_ref, newId)
      newFactIds.push(newId)
      data.facts.push({ fact_id: newId, entity: input.order.brand, claim: fact.claim, source_ids: [id],
        locator: { source_id: id, quote: fact.quote, char_offset: quoteOffset(fact.quote, text!) }, paraphrase: fact.claim,
        kind: fact.kind, use_scope: fact.use_scope, limitation: fact.limitation })
    }
    for (const sample of extracted.value.language_samples) data.language_samples.push({ sample_id: sampleId(sampleIndex++),
      independent_material_id: materialId, canonical_source_id: id, source_id: id, excerpt_or_paraphrase: sample.excerpt,
      channel: 'file', suggested_audience: sample.suggested_audience, situation: sample.situation, linguistic_features: sample.linguistic_features,
      observed_function: sample.observed_function, sample_limit: 'Single client-supplied material; not a representative public channel.' })
    for (const signal of extracted.value.audience_signals) data.audience_signals.push({ signal_id: signalId(signalIndex++),
      role_or_organization: signal.role_or_organization, trigger: signal.trigger, problem: signal.problem, risk: signal.risk,
      objection: signal.objection, evidence_status: signal.evidence_status,
      fact_ids: signal.fact_refs.map((ref) => refs.get(ref)).filter((ref): ref is string => Boolean(ref)) })
  }
  return { data: zrodlaDataSchema.parse(data), source, newFactIds }
}

export function applyMaterialField(findings: UstaleniaData, field: UstaleniaData['field_map'][number], request: MaterialRevisionRequest): UstaleniaData {
  const result = ustaleniaDataSchema.parse(findings)
  result.field_map = result.field_map.map((existing) => {
    if (existing.field_key !== request.directive.briefField) return existing
    // Evidence may supplement a chosen value; a file cannot choose another value for the client.
    if (existing.status === 'client_decision' || existing.decision_state === 'client_selected') return {
      ...existing, evidence_ids: [...new Set([...existing.evidence_ids, ...field.evidence_ids])],
      reason: `${existing.reason}\nSupplementary evidence: ${request.source.submissionId}; existing client decision unchanged.`,
    }
    return { ...field, priority: existing.priority, reason: `${field.reason}\nMaterial: ${request.source.submissionId}; question: ${request.directive.question}` }
  })
  return result
}
