import pack from '../data/prompts/agents.v2.pl.json'

/**
 * Rafał's prompt pack (v2, Polish) — one effective system prompt per agent id,
 * exported 2026-09-19 from `Agenci_v2_Prompty_PL.md`. Rafał owns the wording;
 * the code owns everything else (inputs, schemas, gates, cache keys).
 *
 * `promptFor` returns the pack text when the agent has one, otherwise the
 * composed English instructions the agent file builds (shared rules, contract
 * fields, deslop rules). The pack text already contains the translated
 * contract fields and shared rules, so it replaces the composition wholesale
 * instead of being appended to it. `PROMPT_PACK_VERSION` travels in run
 * metadata so a cached agent output never survives a prompt change.
 */
export const PROMPT_PACK_VERSION: string = pack.version

const prompts: Record<string, string> = pack.prompts

export function promptFor(agentId: string, composed: string[]): string {
  const packed = prompts[agentId]
  return packed && packed.trim().length > 0 ? packed : composed.join(' ')
}

export function hasPackedPrompt(agentId: string): boolean {
  return typeof prompts[agentId] === 'string' && prompts[agentId].trim().length > 0
}
