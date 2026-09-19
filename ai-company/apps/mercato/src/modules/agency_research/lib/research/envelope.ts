import { outputIdByTemplate, type DocumentIssue, type DocumentStatus, type Envelope, type InputVersion, type TemplateId } from '../../data/schemas/envelope'
import { collectCitedIds } from './gate'

/**
 * The COMMON-ENVELOPE is filled by code: agents never see it. `field_evidence`
 * is read off the data itself (every id cited under a top-level key), and
 * `input_versions` are the exact pinned versions the step read.
 */

export type BuildEnvelopeInput = {
  templateId: TemplateId
  orderRef: string
  /** 1-based version number from the store; rendered as "1.0", "2.0", … */
  versionNo: number
  status: DocumentStatus
  inputVersions: InputVersion[]
  data: Record<string, unknown>
  issues: DocumentIssue[]
  simulation?: boolean
}

export function documentIdFor(templateId: TemplateId, orderRef: string): string {
  return `${outputIdByTemplate[templateId]}@${orderRef}`
}

export function versionLabel(versionNo: number): string {
  return `${versionNo}.0`
}

/** Every id cited anywhere under a top-level data key, deduplicated, in first-seen order. */
export function fieldEvidenceOf(data: Record<string, unknown>): Record<string, string[]> {
  const evidence: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(data)) {
    const seen = new Set<string>()
    for (const ids of collectCitedIds(value).values()) for (const id of ids) seen.add(id)
    // The section's own ids are its evidence too (a fact is evidence for the fact bank).
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) if (/_id$/.test(k) && typeof v === 'string') seen.add(v)
        }
      }
    }
    evidence[key] = [...seen]
  }
  return evidence
}

export function buildEnvelope(input: BuildEnvelopeInput): Envelope & { data: Record<string, unknown> } {
  return {
    document_id: documentIdFor(input.templateId, input.orderRef),
    template_id: input.templateId,
    schema_version: '1.1',
    order_id: input.orderRef,
    version: versionLabel(input.versionNo),
    status: input.status,
    input_versions: input.inputVersions,
    field_evidence: fieldEvidenceOf(input.data),
    approval_records: [],
    simulation_flag: input.simulation ?? false,
    issues: input.issues,
    data: input.data,
  }
}
