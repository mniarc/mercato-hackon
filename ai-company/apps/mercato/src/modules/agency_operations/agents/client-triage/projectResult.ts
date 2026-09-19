import {
  CLIENT_TRIAGE_AGENT_ID,
  clientTriageInterpretationSchema,
  clientTriageScopeSchema,
  type ClientTriageAllowedTarget,
  type ClientTriageResult,
  type ClientTriageScope,
} from './contract'

/** Projection accepts only coordinator-derived allowed targets, never targets returned by the model. */
export function projectClientTriageResult(
  scopeInput: ClientTriageScope,
  rawInterpretation: unknown,
  allowedTargets: readonly ClientTriageAllowedTarget[],
): ClientTriageResult {
  const scope = clientTriageScopeSchema.parse(scopeInput)
  const interpretation = clientTriageInterpretationSchema.parse(rawInterpretation)
  const recommendation = interpretation.recommendedDisposition
  let disposition: ClientTriageResult['disposition'] = null
  let unappliedReason: ClientTriageResult['unappliedReason'] = null
  if (recommendation !== 'answer' && recommendation !== 'clarify') {
    unappliedReason = 'unsupported_disposition'
  } else if (interpretation.parts.some((part) => part.recommendedDisposition !== recommendation)) {
    unappliedReason = 'mixed_dispositions'
  } else if (recommendation !== 'clarify' && interpretation.parts.some((part) => part.needsClarification || part.intent === null)) {
    unappliedReason = 'uncertainty_not_clarified'
  } else if (!interpretation.responseMessage) {
    unappliedReason = 'missing_response'
  } else {
    const targetStepId = recommendation === 'answer' ? 'answered' : 'client_reply'
    if (!allowedTargets.includes(targetStepId)) {
      unappliedReason = 'target_not_authorized'
    } else {
      disposition = recommendation === 'answer'
        ? { kind: 'answer', targetStepId: 'answered' }
        : { kind: 'clarify', targetStepId: 'client_reply' }
    }
  }
  return { source: 'native_agent', workerId: CLIENT_TRIAGE_AGENT_ID, scope, interpretation, disposition, unappliedReason, effectsApplied: false }
}
