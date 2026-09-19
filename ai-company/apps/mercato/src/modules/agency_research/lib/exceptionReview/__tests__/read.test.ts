import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { readResearchException } from '../read'
import { buildEscalation } from '../../research/escalate'

jest.mock('@open-mercato/shared/lib/encryption/find', () => ({ findOneWithDecryption: jest.fn() }))
const find = jest.mocked(findOneWithDecryption)
const scope = { tenantId: 'tenant', organizationId: 'organization' }
const data = buildEscalation({
  code: 'qa_exhausted', summary: 'Evidence conflicts', triggerStep: '3.7', evidence: [{ ref: 'source-1', fact: 'Conflicting source' }],
  blockedSteps: ['3.8'], decisionQuestion: 'Which source is correct?',
  allowedResolutions: [{ code: 'keep_blocked', requiredEvidence: 'Reason', permittedNextStep: 'none' }], resumeStep: null,
})

beforeEach(() => find.mockReset())

test('loads only the exact exception version inside the scoped order document', async () => {
  find.mockResolvedValueOnce({ id: 'document', currentVersionId: 'version', status: 'blocked' } as never)
    .mockResolvedValueOnce({ id: 'version', versionNo: 2, status: 'blocked', taskRunId: 'run', data } as never)
  await expect(readResearchException({} as never, scope, 'case', 'version')).resolves.toMatchObject({
    orderRef: 'case', versionId: 'version', version: '2.0', isCurrent: true, taskRunId: 'run', data,
  })
  expect(find.mock.calls[0][2]).toEqual({ ...scope, orderRef: 'case', templateId: 'WZR-ESKALACJA', deletedAt: null })
  expect(find.mock.calls[1][2]).toEqual({ ...scope, id: 'version', documentId: 'document', orderRef: 'case', templateId: 'WZR-ESKALACJA' })
})

test('does not leak a version from another case or tenant', async () => {
  find.mockResolvedValueOnce(null)
  await expect(readResearchException({} as never, scope, 'other-case', 'version')).resolves.toBeNull()
  expect(find).toHaveBeenCalledTimes(1)
})

test('retains stale-version identity instead of substituting the current version', async () => {
  find.mockResolvedValueOnce({ id: 'document', currentVersionId: 'newer', status: 'blocked' } as never)
    .mockResolvedValueOnce({ id: 'old', versionNo: 1, status: 'blocked', taskRunId: 'run', data } as never)
  await expect(readResearchException({} as never, scope, 'case', 'old')).resolves.toMatchObject({ versionId: 'old', isCurrent: false })
})
