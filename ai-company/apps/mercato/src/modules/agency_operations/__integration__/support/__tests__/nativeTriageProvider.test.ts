/** @jest-environment node */
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { outputSchema } from '../../../agents/client-triage/contract'
import {
  NATIVE_TRIAGE_FIXTURE_MARKERS,
  NATIVE_TRIAGE_FIXTURE_MODEL,
  NATIVE_TRIAGE_FIXTURE_TOKEN,
  startNativeTriageProvider,
} from '../nativeTriageProvider'

test('the installed SDK reads typed fixture output and can retry the same original after an explicit failure', async () => {
  const fixture = await startNativeTriageProvider(0)
  try {
    const provider = createOpenAI({ baseURL: fixture.baseUrl, apiKey: NATIVE_TRIAGE_FIXTURE_TOKEN })
    const run = (text: string) => generateObject({
      model: provider(NATIVE_TRIAGE_FIXTURE_MODEL),
      schema: outputSchema,
      schemaName: 'agency_operations_client_triage',
      prompt: JSON.stringify({ original: { eventId: 'fixture-protocol-proof', text } }),
      maxRetries: 0,
    })

    const clarification = await run(NATIVE_TRIAGE_FIXTURE_MARKERS.clarify)
    expect(clarification.object).toMatchObject({ recommendedDisposition: 'clarify', parts: [expect.objectContaining({ needsClarification: true })] })

    const original = NATIVE_TRIAGE_FIXTURE_MARKERS.answer
    fixture.failNext()
    await expect(run(original)).rejects.toMatchObject({ statusCode: 400, isRetryable: false })
    const recovered = await run(original)
    expect(recovered.object).toMatchObject({ recommendedDisposition: 'answer', parts: [expect.objectContaining({ needsClarification: false })] })
    expect(fixture.calls).toEqual([
      { status: 200, disposition: 'clarify' }, { status: 400 }, { status: 200, disposition: 'answer' },
    ])
  } finally {
    await fixture.close()
  }
}, 15_000)
