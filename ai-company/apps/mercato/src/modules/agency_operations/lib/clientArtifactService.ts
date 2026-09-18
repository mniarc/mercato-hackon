import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AgencyTovDocument, AgencyTovDocumentVersion } from '@/modules/agency_tov/data/entities'
import { AgencyCase } from '../data/entities'
import { AGENCY_TOV_RESULT_CONTEXT_KEY, AGENCY_TOV_WORKFLOW_ID } from './tovProcess'
import { CLIENT_CASE_QUERY_SERVICE, type ClientCaseIdentity, type ClientCaseQueryService } from './contracts/clientCaseQuery'
import { clientTovContentSchema, type ClientArtifactService, type ClientArtifactSummary } from './contracts/clientArtifact'

const researchReferenceSchema = z.object({
  result: z.object({ researchRunId: z.uuid(), documentVersionIds: z.array(z.uuid()) }),
})

export function createClientArtifactService(container: AppContainer): ClientArtifactService {
  const em = container.resolve<EntityManager>('em')
  const caseQuery = container.resolve<ClientCaseQueryService>(CLIENT_CASE_QUERY_SERVICE)

  async function linkedVersions(identity: ClientCaseIdentity, caseId: string, versionId?: string) {
    if (!await caseQuery.get(identity, caseId)) {
      throw new CrudHttpError(404, { error: 'api.errors.notFound' })
    }
    const scope = { tenantId: identity.tenantId, organizationId: identity.organizationId }
    const agencyCase = await findOneWithDecryption(em, AgencyCase, {
      id: caseId, ...scope, customerEntityId: identity.customerEntityId, deletedAt: null,
    }, { fields: ['id', 'workflowInstanceId'] }, scope)
    if (!agencyCase?.workflowInstanceId) return []
    const workflow = await findOneWithDecryption(em, WorkflowInstance, {
      id: agencyCase.workflowInstanceId, ...scope, workflowId: AGENCY_TOV_WORKFLOW_ID, deletedAt: null,
    }, { fields: ['id', 'context'] }, scope)
    const reference = researchReferenceSchema.safeParse(workflow?.context?.[AGENCY_TOV_RESULT_CONTEXT_KEY])
    if (!reference.success) return []
    const ids = reference.data.result.documentVersionIds
    if (!ids.length || (versionId && !ids.includes(versionId))) return []
    const versions = await findWithDecryption(em, AgencyTovDocumentVersion, {
      id: versionId ? versionId : { $in: ids }, ...scope,
      researchRunId: reference.data.result.researchRunId,
    }, { fields: ['id', 'documentId', 'versionNo', 'createdAt', 'body'], orderBy: { createdAt: 'desc', id: 'desc' } }, scope)
    if (!versions.length) return []
    const documents = await findWithDecryption(em, AgencyTovDocument, {
      id: { $in: versions.map((version) => version.documentId) }, ...scope, kind: 'KLI-TOV', deletedAt: null,
    }, { fields: ['id', 'title'] }, scope)
    const documentById = new Map(documents.map((document) => [document.id, document]))
    return versions.flatMap((version) => {
      const document = documentById.get(version.documentId)
      if (!document) return []
      const summary: ClientArtifactSummary = {
        caseId, documentId: document.id, versionId: version.id, versionNo: version.versionNo,
        kind: 'KLI-TOV', title: document.title, createdAt: version.createdAt.toISOString(),
      }
      return [{ summary, body: version.body }]
    })
  }

  return {
    async list(identity, caseId) {
      return (await linkedVersions(identity, caseId)).map(({ summary }) => summary)
    },
    async get(identity, caseId, versionId) {
      const linked = (await linkedVersions(identity, caseId, versionId))[0]
      if (!linked) return null
      let body: unknown
      try {
        body = JSON.parse(linked.body)
      } catch {
        throw new CrudHttpError(409, { error: 'api.errors.invalidPayload' })
      }
      const content = clientTovContentSchema.safeParse(body)
      if (!content.success) throw new CrudHttpError(409, { error: 'api.errors.invalidPayload' })
      return { ...linked.summary, contentFormat: 'tov-brand-json', content: content.data }
    },
  }
}
