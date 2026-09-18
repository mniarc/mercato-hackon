import { apiCall as callApi } from '@open-mercato/ui/backend/utils/apiCall'
import { buildAgencyMaterialFileUrl } from './attachmentBridge'

export type AgencyCaseRow = {
  id: string
  customerEntityId: string
  submittedByCustomerUserId: string
  title: string
  agentWorkerId: string
  hasMaterial: boolean
  materialFileName: string | null
  materialMimeType: string | null
  materialFileSize: number | null
  workflowInstanceId: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AgencyCasesPage = {
  items: AgencyCaseRow[]
  total: number
  totalPages: number
  totalIsCapped: boolean
}

export type AgencyCasesQuery = {
  page: number
  pageSize: number
  search?: string
  sortField?: string
  sortDir?: 'asc' | 'desc'
}

export type AgencyCaseDetailView = {
  agencyCase: AgencyCaseRow
  materialUrl: string | null
  workflow: {
    id: string
    status: string
    input: unknown
    output: unknown
    error: unknown
  } | null
}

type AgencyCasesResponse = {
  items?: AgencyCaseRow[]
  total?: number
  totalPages?: number
  totalIsCapped?: boolean
}

type WorkflowInstanceResponse = {
  data?: {
    id: string
    status: string
    context?: unknown
  }
}

type WorkflowStep = {
  stepId: string
  inputData?: unknown
  outputData?: unknown
  errorData?: unknown
}

type WorkflowStepsResponse = {
  data?: WorkflowStep[]
}

function buildCasesQuery(query: AgencyCasesQuery): string {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.sortField) params.set('sortField', query.sortField)
  if (query.sortDir) params.set('sortDir', query.sortDir)
  return params.toString()
}

function readContextValue(context: unknown, key: string): unknown {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null
  return (context as Record<string, unknown>)[key] ?? null
}

export async function loadAgencyCases(query: AgencyCasesQuery): Promise<AgencyCasesPage> {
  const fallback: AgencyCasesResponse = { items: [], total: 0, totalPages: 1 }
  const call = await callApi<AgencyCasesResponse>(
    `/api/agency_operations/cases?${buildCasesQuery(query)}`,
    undefined,
    { fallback },
  )
  if (!call.ok) throw new Error('[internal] Failed to load agency cases')

  const result = call.result ?? fallback
  return {
    items: Array.isArray(result.items) ? result.items : [],
    total: typeof result.total === 'number' ? result.total : 0,
    totalPages: typeof result.totalPages === 'number' ? result.totalPages : 1,
    totalIsCapped: result.totalIsCapped === true,
  }
}

export async function loadAgencyCaseDetail(caseId: string): Promise<AgencyCaseDetailView | null> {
  const caseCall = await callApi<AgencyCasesResponse>(
    `/api/agency_operations/cases?id=${encodeURIComponent(caseId)}&pageSize=1`,
    undefined,
    { fallback: { items: [], total: 0, totalPages: 1 } },
  )
  if (!caseCall.ok) throw new Error('[internal] Failed to load agency case')

  const agencyCase = caseCall.result?.items?.[0]
  if (!agencyCase) return null

  const materialUrl = agencyCase.hasMaterial
    ? buildAgencyMaterialFileUrl(agencyCase.id)
    : null

  if (!agencyCase.workflowInstanceId) {
    return { agencyCase, materialUrl, workflow: null }
  }

  const workflowInstanceId = agencyCase.workflowInstanceId
  const [instanceCall, stepsCall] = await Promise.all([
    callApi<WorkflowInstanceResponse>(`/api/workflows/instances/${encodeURIComponent(workflowInstanceId)}`),
    callApi<WorkflowStepsResponse>(
      `/api/workflows/instances/${encodeURIComponent(workflowInstanceId)}/steps?limit=100`,
    ),
  ])
  if (!instanceCall.ok || !instanceCall.result?.data || !stepsCall.ok) {
    throw new Error('[internal] Failed to load agency case workflow evidence')
  }

  const workerStep = [...(stepsCall.result?.data ?? [])]
    .reverse()
    .find((step) => step.stepId === 'agent_worker')
  const activityOutput = readContextValue(instanceCall.result.data.context, 'agentWorkerResult')
  const agentOutput = readContextValue(activityOutput, 'result')
  const agentInput = readContextValue(agentOutput, 'input')

  return {
    agencyCase,
    materialUrl,
    workflow: {
      id: instanceCall.result.data.id,
      status: instanceCall.result.data.status,
      input: agentInput ?? workerStep?.inputData ?? null,
      output: agentOutput ?? activityOutput ?? workerStep?.outputData ?? null,
      error: workerStep?.errorData ?? null,
    },
  }
}
