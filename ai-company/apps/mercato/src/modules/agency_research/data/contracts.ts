import contractsJson from './contracts.v1_1.json'
import type { TemplateId } from './schemas/envelope'

/**
 * Rafał's document contracts v1.1 (`02_szablony/contracts.json`, the seven templates
 * this lane produces), vendored verbatim. They are the single source for what a
 * field must contain, what "good" means and what to do when data is missing —
 * the agents get them rendered into their instructions, the gate reads the MUST
 * keys and the client projections from them.
 */

export type ContractField = {
  key: string
  label: string
  priority: 'must' | 'should' | 'could'
  type: string
  description: string
  completion_rule: string
  source: string
  consumed_by: string[]
  missing_action: string
  source_refs: string[]
  nested_contract?: Record<string, unknown>
}

export type ContractInput = { id: string; required_state: string; needed_fields: string[] }

export type ContractHandoff = { consumer: string; consumer_template_id: string; fields: string[]; ready_when: string; contract: string }

export type ClientProjection = {
  mode: string
  source_fields: string[]
  word_limit: number | null
  word_count_rule: string
  omit: string[]
  render_rule: string
}

export type Contract = {
  id: TemplateId
  name: string
  output_id: string
  owner: string
  process: string
  inputs: ContractInput[]
  purpose: string
  client_view_limit: string
  fields: ContractField[]
  quality_gates: string[]
  handoff: ContractHandoff[]
  do_not_duplicate: string[]
  definition_version: string
  input_contract: string
  client_projection: ClientProjection
}

const contracts = contractsJson as unknown as Contract[]

export function contractFor(templateId: TemplateId): Contract {
  const contract = contracts.find((entry) => entry.id === templateId)
  if (!contract) throw new Error(`[internal] no vendored contract for ${templateId}`)
  return contract
}

export function mustKeysOf(templateId: TemplateId): string[] {
  return contractFor(templateId).fields.filter((field) => field.priority === 'must').map((field) => field.key)
}

/**
 * The template's field definitions as the agent sees them: key, priority, what it
 * holds, what a good answer is, what to do when data is missing, nested contract.
 * `keys` narrows a section-sized agent to the fields it owns.
 */
export function renderContractFields(templateId: TemplateId, keys?: string[]): string {
  const contract = contractFor(templateId)
  const fields = keys ? contract.fields.filter((field) => keys.includes(field.key)) : contract.fields
  const lines = [`Template ${contract.id} v${contract.definition_version} → ${contract.output_id} (process ${contract.process}). Purpose: ${contract.purpose}`]
  for (const field of fields) {
    lines.push(`- \`${field.key}\` [${field.priority.toUpperCase()}, ${field.type}]: ${field.description}`)
    lines.push(`  Good answer: ${field.completion_rule}`)
    lines.push(`  When data is missing: ${field.missing_action}`)
    if (field.nested_contract && Object.keys(field.nested_contract).length) lines.push(`  Nested contract: ${JSON.stringify(field.nested_contract)}`)
  }
  if (contract.quality_gates.length) lines.push(`Quality conditions: ${contract.quality_gates.join(' ')}`)
  if (contract.do_not_duplicate.length) lines.push(`Do not repeat earlier documents: ${contract.do_not_duplicate.join(' ')}`)
  return lines.join('\n')
}

/** The client projection rule for a template — what the client view may show and how long it may be. */
export function clientProjectionOf(templateId: TemplateId): ClientProjection {
  return contractFor(templateId).client_projection
}

export const allContracts = contracts
