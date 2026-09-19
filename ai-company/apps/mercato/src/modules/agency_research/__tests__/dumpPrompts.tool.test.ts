/**
 * Not a test: a one-shot extractor that writes every agency agent's resolved
 * system prompt to `.ai/docs/agency-agent-prompts.md` for prompt review. Run
 * with `yarn jest --config jest.config.cjs dumpPrompts.tool` from apps/mercato.
 * The prompts live in code (`lib/agents/*.ts`); the markdown is the review copy.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { aiAgents as researchAgents } from '../ai-agents'
import { aiAgents as tovAgents } from '../../agency_tov/ai-agents'

const OUT = path.resolve(__dirname, '../../../../../../.ai/docs/agency-agent-prompts.md')

type Row = { id: string; label: string; description: string; model: string; prompt: string; schema: string }

function schemaKeys(definition: AiAgentDefinition): string {
  const output = (definition as unknown as { output?: { schema?: { shape?: Record<string, unknown> } } }).output
  const shape = output?.schema?.shape
  if (!shape) return '—'
  const data = (shape.data as { shape?: Record<string, unknown> } | undefined)?.shape
  return data ? Object.keys(data).join(', ') : Object.keys(shape).join(', ')
}

function rowOf(definition: AiAgentDefinition): Row {
  const d = definition as unknown as { id: string; label?: string; description?: string; defaultModel?: string; systemPrompt?: string }
  return { id: d.id, label: d.label ?? d.id, description: d.description ?? '', model: d.defaultModel ?? '(shared default)', prompt: d.systemPrompt ?? '', schema: schemaKeys(definition) }
}

/** Break the one-line prompts into sentences so a reviewer can edit line by line. */
function sentences(prompt: string): string {
  return prompt
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ`(\d])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join('\n')
}

const PHASES: Array<[string, RegExp]> = [
  ['3.2 Sources — readers and reducers', /page_extractor|proof_builder|content_seeder|conflict_finder|coverage_assessor/],
  ['3.3 Audit', /audit_/],
  ['3.4–3.5 Competitors', /competitor_/],
  ['3.6–3.7 Findings map and research QA', /field_mapper|question_writer|readiness_assessor|research_qa/],
  ['4.1–4.2 Brief', /brief_/],
  ['5.2–5.4 Strategy, tone of voice, Q-S', /strategy_|tov_writer/],
  ['6.2–6.3 Plan and Q-P', /plan_/],
  ['7.2–7.3 Post author and editor (Q-T)', /post_/],
  ['Tone-of-voice corpus lane (agency_tov)', /agency_tov\./],
]

test('writes the prompt review document', () => {
  const rows = [...researchAgents, ...tovAgents].map(rowOf)
  const lines: string[] = [
    '# Agency agents — prompt review copy',
    '',
    `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from the registered agent definitions (${rows.length} agents).`,
    'Source of truth is the prompt pack: `apps/mercato/src/modules/agency_research/data/prompts/agents.v2.pl.json` and `apps/mercato/src/modules/agency_tov/data/prompts/agents.v2.pl.json` (Rafał's Agenci v2, Polish, one entry per agent id, loaded by `lib/agents/prompts.ts`); an agent missing from the pack falls back to the English composition in `lib/agents/*.ts` (shared rules in `shared.ts`, deslop rules in `deslop.ts`).',
    'Each prompt below is the exact system prompt the model receives, split one sentence per line for editing. Field definitions rendered from Rafał\'s WZR-* contracts (`data/contracts.v1_1.json`) are included where the agent carries them.',
    '',
    '## How to propose a change',
    '',
    '- Edit the sentence(s) here and note the agent id; the change is then applied to that id's entry in the prompt pack JSON (bump `version` there so cached outputs are not replayed).',
    '- Model tiers: extract/QA = `openrouter/anthropic/claude-haiku-4.5`, synthesis = `openrouter/anthropic/claude-sonnet-5` (overridable per tier with `OM_AGENCY_RESEARCH_MODEL_*`).',
    '- Every agent is tool-less and read-only: its whole world is the JSON input the step builds; every id it cites must exist in that input (gates drop the rest). Prompts should keep that contract.',
    '- Output shape is fixed by the zod schema listed under *Returns*; a prompt can change *how* fields are filled, not *which* fields exist.',
    '',
  ]
  for (const [title, pattern] of PHASES) {
    const phaseRows = rows.filter((row) => pattern.test(row.id))
    if (!phaseRows.length) continue
    lines.push(`## ${title}`, '')
    for (const row of phaseRows) {
      lines.push(`### \`${row.id}\` — ${row.label}`, '')
      lines.push(`- Purpose: ${row.description}`)
      lines.push(`- Model: \`${row.model}\``)
      lines.push(`- Returns: ${row.schema}`, '')
      lines.push('```text', sentences(row.prompt), '```', '')
    }
  }
  const leftover = rows.filter((row) => !PHASES.some(([, pattern]) => pattern.test(row.id)))
  if (leftover.length) {
    lines.push('## Other', '')
    for (const row of leftover) lines.push(`### \`${row.id}\` — ${row.label}`, '', `- Purpose: ${row.description}`, `- Model: \`${row.model}\``, `- Returns: ${row.schema}`, '', '```text', sentences(row.prompt), '```', '')
  }
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, lines.join('\n') + '\n')
  expect(rows.length).toBeGreaterThan(30)
})
