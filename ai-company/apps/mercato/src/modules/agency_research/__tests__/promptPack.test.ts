/**
 * Pins the v2 prompt pack to the agent registry: every registered research agent
 * receives its Polish v2 prompt (except the ones the pack does not cover yet),
 * no pack entry is orphaned, and a packed prompt is what the definition carries.
 */
import { aiAgents } from '../ai-agents'
import pack from '../data/prompts/agents.v2.pl.json'
import { PROMPT_PACK_VERSION, hasPackedPrompt, promptFor } from '../lib/agents/prompts'

const NOT_YET_PACKED = new Set(['agency_research.brief_answers'])

describe('prompt pack v2', () => {
  const registered = aiAgents.map((agent) => agent.id)

  it('covers every registered research agent except the known exceptions', () => {
    const uncovered = registered.filter((id) => !hasPackedPrompt(id) && !NOT_YET_PACKED.has(id))
    expect(uncovered).toEqual([])
    for (const id of NOT_YET_PACKED) expect(hasPackedPrompt(id)).toBe(false)
  })

  it('has no orphan prompt (a key without a registered agent)', () => {
    const orphans = Object.keys(pack.prompts).filter((id) => !registered.includes(id))
    expect(orphans).toEqual([])
  })

  it('is the instruction text the definition carries, verbatim', () => {
    for (const agent of aiAgents as unknown as { id: string; systemPrompt: string }[]) {
      if (!hasPackedPrompt(agent.id)) continue
      expect(agent.systemPrompt).toBe((pack.prompts as Record<string, string>)[agent.id])
      expect(agent.systemPrompt.length).toBeGreaterThan(1000)
    }
  })

  it('falls back to the composed instructions when an agent has no packed prompt', () => {
    expect(promptFor('agency_research.not_a_real_agent', ['a', 'b'])).toBe('a b')
    expect(PROMPT_PACK_VERSION).toMatch(/^v2-pl-\d{4}-\d{2}-\d{2}$/)
  })
})
