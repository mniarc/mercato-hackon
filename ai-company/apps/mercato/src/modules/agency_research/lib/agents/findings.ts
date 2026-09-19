import type { AiAgentDefinition } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-agent-definition'
import { defineAgent } from '@open-mercato/enterprise/modules/agent_orchestrator/lib/sdk/defineAgent'
import { researchQaResult } from '../../data/validators'
import { RESEARCH_QA_AGENT_ID } from './ids.findings'
import { MODEL_QA, SHARED_RULES } from './shared'

// F08 — findings map (3.6) and analysis QA (3.7). The QA agent was defined in F06 so
// the registry is stable; the 3.6 agents (field_mapper, question_writer,
// readiness_assessor) join it here.

export const findingsAgents: AiAgentDefinition[] = [
  // 3.7 — quality control over the finished analysis (used from F08 on; defined now so the registry is stable).
  defineAgent({
    id: RESEARCH_QA_AGENT_ID,
    moduleId: 'agency_research',
    agentType: 'researcher',
    label: 'Research analysis QA',
    description: 'Checks the analysis documents for unsourced claims, fact/interpretation mixing, contradictions and missing fields; returns ready / to_fix / exception with owned findings.',
    defaultModel: MODEL_QA,
    instructions: [
      'You are the quality agent for step 3.7. You receive the analysis `documents` (their data,',
      'with ids) and the deterministic `validator_findings` already computed. Check against',
      '`criteria`: every important conclusion has a source and a limitation; facts, hypotheses and',
      'missing data are distinguishable; no effectiveness, ROI or uniqueness claim rests on public',
      'reactions or on absence at competitors; no future vision, goal or priority of the client is',
      'recorded as a fact taken from the current website; required fields are present; questions',
      'do not ask for data already in the register. Return `findings` (≤20): `code`, the exact',
      '`path`, `severity` (`blocking` stops the handover), the `gap`, the `owner` (`agent` when the',
      'author step must fix it, `client` when only the client can answer, `research` when a source',
      'must be read, `staff` for an unsolvable problem), `fix_step` (3.2–3.6) and a `fix_hint`. The',
      '`verdict` is exactly one of `ready` (no blocking finding), `to_fix` (blocking findings owned',
      'by an agent step), `exception` (a problem no agent step can solve). Internal QA never asks',
      'the client for a revision. Summarise in `summary`.',
      SHARED_RULES,
    ].join(' '),
    result: { kind: 'research', schema: researchQaResult },
  }),
]
