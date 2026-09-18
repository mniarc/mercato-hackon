import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { loadAgencyCaseDetail } from '../caseViewModel'

jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))

const apiCallMock = jest.mocked(apiCall)

function mockDetail(instance: Record<string, unknown>, steps: unknown[] = []) {
  apiCallMock.mockImplementation(async (url) => {
    const path = String(url)
    const result = path.startsWith('/api/agency_operations/cases?')
      ? { items: [{ id: 'case-1', workflowInstanceId: 'workflow-1', hasMaterial: false }] }
      : path.includes('/steps?')
        ? { data: steps }
        : { data: { id: 'workflow-1', ...instance } }
    return { ok: true, status: 200, result } as never
  })
}

afterEach(() => jest.resetAllMocks())

test('pending native research stays pending without invented results', async () => {
  mockDetail({ status: 'WAITING_FOR_ACTIVITIES', context: {} })

  const detail = await loadAgencyCaseDetail('case-1')

  expect(detail?.workflow).toMatchObject({
    status: 'WAITING_FOR_ACTIVITIES',
    research: null,
    output: null,
  })
})

test('completed research uses exact persisted IDs from its workflow activity', async () => {
  const result = {
    researchRunId: 'research-1',
    documentVersionIds: ['document-1'],
    agentRunIds: ['agent-run-1', 'agent-run-2'],
  }
  mockDetail({ status: 'COMPLETED', context: { research_tov_result: { result } } })

  const detail = await loadAgencyCaseDetail('case-1')

  expect(detail?.workflow?.research).toEqual(result)
  expect(detail?.workflow?.output).toEqual(result)
})

test('native workflow failures remain visible when no activity output was stored', async () => {
  mockDetail({ status: 'FAILED', context: {}, errorMessage: 'Provider unavailable' })

  const detail = await loadAgencyCaseDetail('case-1')

  expect(detail?.workflow).toMatchObject({ status: 'FAILED', error: 'Provider unavailable', research: null })
})
