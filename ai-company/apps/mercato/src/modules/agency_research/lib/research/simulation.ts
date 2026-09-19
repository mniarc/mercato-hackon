import type { InputVersion } from '../../data/schemas/envelope'

/**
 * Simulation is a property of the inputs, never a decision of a step: when a
 * client-facing document a step consumes has not been approved by the client
 * (status other than `approved`), everything downstream carries
 * `simulation_flag: true` and an explicit `SIMULATED_INPUT` issue, and no
 * record of it may be presented as a client decision (STD-PROCES: a synthetic
 * approval stays "missing" in a real run).
 */

const clientFacing = /^KLI-/

export function isApprovedInput(input: InputVersion): boolean {
  return input.status === 'approved'
}

export function simulatedInputs(inputs: InputVersion[]): InputVersion[] {
  return inputs.filter((input) => clientFacing.test(input.document_id) && !isApprovedInput(input))
}

export function simulationIssue(inputs: InputVersion[]): { code: 'SIMULATED_INPUT'; severity: 'limitation'; detail: string } | null {
  const simulated = simulatedInputs(inputs)
  if (!simulated.length) return null
  return {
    code: 'SIMULATED_INPUT',
    severity: 'limitation',
    detail: `built on unapproved client documents: ${simulated.map((s) => `${s.document_id} v${s.version} (${s.status ?? 'draft'})`).join(', ')}; a client decision has not been recorded`,
  }
}
