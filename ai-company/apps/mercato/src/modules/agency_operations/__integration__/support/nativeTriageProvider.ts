import { createServer } from 'node:http'
import { z } from 'zod'
import { clientTriageInterpretationSchema, inputSchema } from '../../agents/client-triage/contract'

export const NATIVE_TRIAGE_FIXTURE_MODEL = 'agency-triage-fixture'
export const NATIVE_TRIAGE_FIXTURE_TOKEN = 'agency-triage-fixture-only'
export const NATIVE_TRIAGE_FIXTURE_MARKERS = {
  answer: 'Fixture answer after recovery.', clarify: 'Please help me clarify the next step.',
} as const

const requestSchema = z.object({
  model: z.literal(NATIVE_TRIAGE_FIXTURE_MODEL),
  stream: z.literal(false).optional(),
  input: z.array(z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]),
  })),
  text: z.object({ format: z.object({
    type: z.literal('json_schema'), name: z.literal('agency_operations_client_triage'),
  }) }),
})

export async function startNativeTriageProvider(port = 5003) {
  const calls: Array<{ status: number; disposition?: 'answer' | 'clarify' | 'approve' }> = []
  let expectedPlan: { documentId: string; versionId: string; taskId: string; selectedTopicId: string } | undefined
  let expectedPost: { documentId: string; versionId: string; taskId: string } | undefined
  let pendingFailure = false
  const server = createServer(async (request, response) => {
    const send = (status: number, payload: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(payload))
    }
    const fail = (status: number, message: string) => {
      calls.push({ status })
      send(status, { error: { message, type: 'invalid_request_error', code: 'native_triage_fixture', param: null } })
    }
    if (request.method !== 'POST' || request.url !== '/v1/responses') return fail(400, 'Unexpected native triage fixture endpoint')
    if (request.headers.authorization !== `Bearer ${NATIVE_TRIAGE_FIXTURE_TOKEN}`) return fail(401, 'Fixture token required')
    try {
      let body = ''
      for await (const chunk of request) {
        body += String(chunk)
        if (body.length > 1_000_000) return fail(413, 'Fixture request too large')
      }
      const parsed = requestSchema.safeParse(JSON.parse(body))
      if (!parsed.success) return fail(400, 'Unexpected model, stream mode, or structured triage request')
      const userMessages = parsed.data.input.filter((message) => message.role === 'user')
      const input = JSON.stringify(userMessages)
      const planApproval = userMessages.flatMap((message) => typeof message.content === 'string' ? [message.content] : message.content.flatMap((part) => part.text ? [part.text] : []))
        .some((text) => {
          if (!expectedPlan) return false
          try {
            const candidate = inputSchema.safeParse(JSON.parse(text))
            if (!candidate.success) return false
            const original = candidate.data.original
            const review = original.planReviewResponse
            return review?.kind === 'approval' && review.approvePlan === true && review.taskId === expectedPlan.taskId
              && review.plan.documentId === expectedPlan.documentId && review.plan.versionId === expectedPlan.versionId
              && original.documentVersionReference === expectedPlan.versionId && review.selectedTopicId === expectedPlan.selectedTopicId
          } catch { return false }
        })
      const markers = Object.entries(NATIVE_TRIAGE_FIXTURE_MARKERS).filter(([, marker]) => input.includes(marker))
      const postApproval = userMessages.flatMap((message) => typeof message.content === 'string' ? [message.content] : message.content.flatMap((part) => part.text ? [part.text] : []))
        .some((text) => {
          if (!expectedPost) return false
          try {
            const candidate = inputSchema.safeParse(JSON.parse(text))
            if (!candidate.success) return false
            const original = candidate.data.original
            const review = original.postReviewResponse
            return review?.kind === 'approval' && review.approveContent === true && review.taskId === expectedPost.taskId
              && review.post.documentId === expectedPost.documentId && review.post.versionId === expectedPost.versionId
              && original.documentVersionReference === expectedPost.versionId
          } catch { return false }
        })
      const approval = planApproval || postApproval
      if ((!approval && markers.length !== 1) || (approval && markers.length)) return fail(400, 'One explicit triage fixture marker or registered exact review approval required')
      const disposition = approval ? 'approve' : markers[0][0] as 'answer' | 'clarify'
      if (pendingFailure) {
        pendingFailure = false
        return fail(400, 'Deliberate non-retryable triage fixture failure')
      }
      const interpretation = clientTriageInterpretationSchema.parse({
        parts: [{ intent: approval ? 'approval' : 'question', summary: 'Explicit demonstration submission', rationale: 'Deterministic intelligence fixture, not live inference.', needsClarification: disposition === 'clarify', recommendedDisposition: disposition }],
        rationale: 'Deterministic intelligence fixture, not live inference.', recommendedDisposition: disposition,
        responseMessage: disposition === 'clarify' ? 'Which outcome would you like us to work on?' : 'Your submission is available for review.',
      })
      calls.push({ status: 200, disposition })
      send(200, {
        id: `resp_fixture_${calls.length}`, object: 'response', created_at: Math.floor(Date.now() / 1000),
        model: NATIVE_TRIAGE_FIXTURE_MODEL, status: 'completed', error: null, incomplete_details: null,
        output: [{ type: 'message', id: `msg_fixture_${calls.length}`, role: 'assistant', status: 'completed', content: [
          { type: 'output_text', text: JSON.stringify(interpretation), annotations: [] },
        ] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      })
    } catch {
      fail(400, 'Invalid triage fixture request')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('[internal] Missing triage fixture address')
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`, calls,
    failNext: () => { pendingFailure = true },
    allowPlanApproval: (plan: NonNullable<typeof expectedPlan>) => { expectedPlan = { ...plan } },
    allowPostApproval: (post: NonNullable<typeof expectedPost>) => { expectedPost = { ...post } },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
      server.closeIdleConnections()
    }),
  }
}
