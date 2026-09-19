import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyTovDocument, AgencyTovDocumentVersion, AgencyTovResearchRun } from '../../data/entities'
import { tovBrandVoiceSchema, tovCitationSchema, type TovBrandVoice, type TovCitation } from '../../data/validators'
import type { TovScope } from '../store'
import { specialistTovReferenceSchema, type SpecialistTovDocument, type SpecialistTovReference } from './contracts'

export type TovDocumentVersionRequest = Pick<SpecialistTovReference, 'researchRunId' | 'versionId'>
const scopeSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })
const requestSchema = specialistTovReferenceSchema.pick({ researchRunId: true, versionId: true })

/** Server-only read. Caller authorizes the staff operation or exact customer task/case. */
export async function readTovDocumentVersion(
  em: EntityManager,
  scope: TovScope,
  reference: TovDocumentVersionRequest,
): Promise<SpecialistTovDocument | null> {
  const parsedScope = scopeSchema.safeParse(scope)
  const parsedReference = requestSchema.safeParse(reference)
  if (!parsedScope.success || !parsedReference.success) return null
  const ownedScope = parsedScope.data
  const { researchRunId, versionId } = parsedReference.data
  const run = await findOneWithDecryption(em, AgencyTovResearchRun, {
    ...ownedScope, id: researchRunId, status: 'done',
  }, {}, ownedScope)
  if (!run) return null
  const version = await findOneWithDecryption(em, AgencyTovDocumentVersion, {
    ...ownedScope, id: versionId, researchRunId: run.id,
  }, {}, ownedScope)
  if (!version) return null
  const document = await findOneWithDecryption(em, AgencyTovDocument, {
    ...ownedScope, id: version.documentId, kind: 'KLI-TOV', deletedAt: null,
  }, {}, ownedScope)
  if (!document || document.brand !== run.brand) return null
  let body: unknown
  try { body = JSON.parse(version.body) } catch { return null }
  if (!tovBrandVoiceSchema.safeParse(body).success || !tovCitationSchema.array().safeParse(version.citations).success) return null
  const exactReference = specialistTovReferenceSchema.safeParse({
    owner: 'agency_tov', kind: 'KLI-TOV', researchRunId: run.id,
    documentId: document.id, versionId: version.id, version: `${version.versionNo}.0`,
  })
  if (!exactReference.success) return null
  return {
    ...exactReference.data,
    brand: document.brand,
    isCurrent: document.currentVersionId === version.id,
    body: body as TovBrandVoice,
    renderedMd: version.renderedMd,
    citations: version.citations as TovCitation[],
  }
}
