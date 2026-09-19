import fs from 'node:fs'
import path from 'node:path'
import { getAgentEntry } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { ModelSet, ResearchAgentRunner } from './research/pipeline'
import type { Usage } from './research/ledger'

/**
 * Prompt iteration WITHOUT the platform (`--runner direct`): the same registered
 * instructions and schemas, one bare structured-output call per step, usage read
 * from the provider. Nothing is persisted as an agent run — the orchestrator runner
 * is the production path. Structured output is tried first; on a "schema too large"
 * refusal the schema goes into the prompt and the JSON is parsed and retried, and
 * that decision is remembered per agent for the process.
 */
export function createDirectRunner(opts: { models: ModelSet; outDir: string; env?: NodeJS.ProcessEnv }): ResearchAgentRunner {
  const env = opts.env ?? process.env
  const openrouterKey = env.OPENROUTER_API_KEY
  const openaiKey = env.OPENAI_API_KEY
  if (!openrouterKey && !openaiKey) throw new Error('[internal] --runner direct needs OPENROUTER_API_KEY or OPENAI_API_KEY')
  const provider = openrouterKey
    ? createOpenAI({ apiKey: openrouterKey, baseURL: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1' })
    : createOpenAI({ apiKey: openaiKey })
  const promptOnly = new Set<string>()
  return async (agentId, input, options) => {
    const entry = getAgentEntry(agentId)
    if (!entry) throw new Error(`[internal] unknown agent ${agentId}`)
    const model = opts.models[options.tier as keyof ModelSet] ?? opts.models.extract
    const attempts = 3
    let lastError: unknown
    let text = ''
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (!promptOnly.has(agentId)) {
          try {
            const result = await generateText({
              model: provider.chat(model),
              system: entry.instructions,
              prompt: JSON.stringify(input),
              output: Output.object({ schema: entry.schema }),
              timeout: options.runTimeoutMs,
              maxRetries: 2,
            })
            return { result: result.output, usage: usageOf(model, result.usage) }
          } catch (error) {
            if (!/schema|grammar|too large|json_schema/i.test(error instanceof Error ? error.message : String(error))) throw error
            promptOnly.add(agentId)
          }
        }
        const result = await generateText({
          model: provider.chat(model),
          system: `${entry.instructions}

Respond with ONLY one JSON object (no prose, no code fences; escape every double quote inside strings) that validates against this JSON Schema:
${JSON.stringify(z.toJSONSchema(entry.schema))}`,
          prompt: JSON.stringify(input),
          timeout: options.runTimeoutMs,
          maxRetries: 2,
        })
        text = result.text
        const parsed = entry.schema.safeParse(JSON.parse(text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')))
        if (!parsed.success) throw new Error(`[internal] ${agentId}: output does not match schema — ${parsed.error.message}`)
        return { result: parsed.data, usage: usageOf(model, result.usage) }
      } catch (error) {
        lastError = error
        const details = error && typeof error === 'object' ? (error as { responseBody?: unknown; text?: unknown }) : {}
        fs.mkdirSync(opts.outDir, { recursive: true })
        fs.writeFileSync(path.join(opts.outDir, `failed-${agentId}-${Date.now()}.txt`), `${error instanceof Error ? error.message : String(error)}\n\n${text || String(details.text ?? details.responseBody ?? '')}`)
      }
    }
    throw lastError
  }
}

function usageOf(model: string, usage: { inputTokens?: number; outputTokens?: number } | undefined): Usage {
  return { model, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, costMinor: null, currency: null, agentRunId: null }
}
