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
  if (recommendation !== 'answer' && recommendation !== 'clarify' && recommendation !== 'approve' && recommendation !== 'change') {
    unappliedReason = 'unsupported_disposition'
  } else if (interpretation.parts.some((part) => part.recommendedDisposition !== recommendation)) {
    unappliedReason = 'mixed_dispositions'
  } else if (recommendation !== 'clarify' && interpretation.parts.some((part) => part.needsClarification || part.intent === null)) {
    unappliedReason = 'uncertainty_not_clarified'
  } else if (recommendation === 'approve' && interpretation.parts.some((part) => part.intent !== 'approval')) {
    unappliedReason = 'mixed_dispositions'
  } else if (recommendation === 'change' && interpretation.parts.some((part) => part.intent !== 'change')) {
    unappliedReason = 'mixed_dispositions'
  } else if (recommendation !== 'approve' && recommendation !== 'change' && !interpretation.responseMessage) {
    unappliedReason = 'missing_response'
  } else {
    const approvalTargets = allowedTargets.filter((target) => target === 'brief_accepted' || target === 'strategy_pair_decision' || target === 'plan_topic_decision' || target === 'post_content_decision')
    const targetStepId = recommendation === 'answer' ? 'answered' : recommendation === 'clarify' ? 'client_reply' : recommendation === 'change' ? 'brief_revision' : approvalTargets.length === 1 ? approvalTargets[0] : null
    if (!targetStepId || !allowedTargets.includes(targetStepId)) {
      unappliedReason = 'target_not_authorized'
    } else {
      disposition = recommendation === 'approve'
        ? { kind: 'approve', targetStepId: targetStepId as 'brief_accepted' | 'strategy_pair_decision' | 'plan_topic_decision' | 'post_content_decision' }
        : recommendation === 'change'
        ? { kind: 'change', targetStepId: 'brief_revision' }
        : recommendation === 'answer'
        ? { kind: 'answer', targetStepId: 'answered' }
        : { kind: 'clarify', targetStepId: 'client_reply' }
    }
  }
  return { source: 'native_agent', workerId: CLIENT_TRIAGE_AGENT_ID, scope, interpretation, disposition, unappliedReason, effectsApplied: false }
}
