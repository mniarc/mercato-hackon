import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { createFixtureRunner } from '../../../../agency_research/lib/runners'
import { briefWriterInputSchema } from '../../../../agency_research/data/agents/brief'
import { fieldMapperInputSchema, fieldMapperResult, readinessAssessorInputSchema, readinessAssessorResult } from '../../../../agency_research/data/agents/findings'
import { briefAnswerAgentResultSchema } from '../../../../agency_research/lib/briefRevision/contracts'
import { clientTriageInterpretationSchema, inputSchema } from '../../../agents/client-triage/contract'
import type { NativeStructuredFixtureHook } from '../nativeTriageProvider'

export const CLIENT_ANSWERS: Record<string, string> = {
  priority_offer: 'Priorytetem jest diagnoza problemu biznesowego przed wyborem rozwiązania cyfrowego.',
  priority_audience: 'Kierujemy komunikację do właścicieli procesów i COO w istniejących polskich firmach B2B.',
  business_direction: 'W ciągu 30 dni chcemy wyjaśnić drogę od problemu przez diagnozę do uzasadnionego rozwiązania, bez obietnicy liczby leadów.',
  voice_preferences: 'Wybieram rzeczowy, konkretny język bez hype; wariant VOICE-A jest bliższy naszej firmie.',
  channel_and_cta: 'Kanałem jest LinkedIn firmy; CTA zaprasza do rozmowy przez stronę, ale publikacja pozostaje zablokowana do sprawdzenia ścieżki kontaktu.',
  assets_and_permissions: 'Nie udzielam zgody na nazwy klientów ani cytaty projektowe; korzystamy wyłącznie z anonimowych parafraz.',
  buyer_reality: 'Nie mamy jeszcze zweryfikowanych przykładów sytuacji zakupowych; przedstawiajmy je jako hipotezy, nie badania klientów.',
  success_and_limits: 'Miarą kierunkową jest zrozumienie roli firmy; bez baseline nie zatwierdzam celu liczbowego, gwarancji wyników ani dodatkowego budżetu.',
}

export type InvitedQuestion = { question_id: string; brief_field: string; question: string }
type ExactReview = { documentId: string; versionId: string; taskId: string }

export function answersForQuestions(questions: InvitedQuestion[]): string {
  return questions.map((question) => {
    const answer = CLIENT_ANSWERS[question.brief_field]
    if (!answer) throw new Error(`No explicit fixture customer answer for invited field ${question.brief_field}`)
    return `${question.question_id}: ${answer}`
  }).join('\n\n')
}

export function createProductionJourneyIntelligence(appRoot: string) {
  const canned = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow/canned')
  const fixture = createFixtureRunner(canned)
  const known = new Map<string, string>()
  for (const file of fs.readdirSync(canned).filter((name) => name.endsWith('.json'))) {
    let id = file.slice(0, -5)
    if (id.startsWith('agency_research.page_extractor.')) id = 'agency_research.page_extractor'
    if (id.startsWith('agency_research.tov_writer.')) id = 'agency_research.tov_writer'
    if (id.startsWith('agency_research.plan_writer.topics.')) id = 'agency_research.plan_writer.topics'
    known.set(id.replace(/\W+/g, '_'), id)
  }
  const calls: string[] = []
  let answerInvitation: (ExactReview & { text: string; questions: InvitedQuestion[] }) | undefined
  let approval: ExactReview | undefined
  let pair: { taskId: string; strategy: { documentId: string; versionId: string }; tov: { documentId: string; versionId: string } } | undefined

  const resolveStructured: NativeStructuredFixtureHook = async ({ formatName, userTexts }) => {
    const objects = userTexts.flatMap((text) => { try { return [JSON.parse(text)] } catch { return [] } })
    if (objects.length !== 1) return undefined
    const raw = objects[0]
    if (formatName === 'agency_operations_client_triage') {
      const parsed = inputSchema.safeParse(raw)
      if (!parsed.success) return undefined
      const original = parsed.data.original
      const review = original.reviewResponse
      const strategy = original.strategyReviewResponse
      const change = answerInvitation && review?.kind === 'message' && original.text === answerInvitation.text
        && review.body === answerInvitation.text && review.taskId === answerInvitation.taskId
        && review.documentId === answerInvitation.documentId && review.versionId === answerInvitation.versionId
        && original.documentVersionReference === answerInvitation.versionId
      const approveBrief = approval && review?.kind === 'approval' && review.taskId === approval.taskId
        && review.documentId === approval.documentId && review.versionId === approval.versionId
        && original.documentVersionReference === approval.versionId
      const approvePair = pair && strategy?.kind === 'approval' && strategy.taskId === pair.taskId
        && strategy.strategy.documentId === pair.strategy.documentId && strategy.strategy.versionId === pair.strategy.versionId
        && strategy.tov.documentId === pair.tov.documentId && strategy.tov.versionId === pair.tov.versionId
        && strategy.approvedDocuments?.length === 2 && strategy.approvedDocuments.includes('strategy') && strategy.approvedDocuments.includes('tov')
      if (!change && !approveBrief && !approvePair) return undefined
      calls.push('agency_operations.client_triage')
      const disposition = change ? 'change' : 'approve'
      return clientTriageInterpretationSchema.parse({
        parts: [{ intent: change ? 'change' : 'approval', summary: 'Explicit response to the registered exact review.',
          rationale: 'Fixture interpretation of the customer action, not an acceptance receipt.', needsClarification: false, recommendedDisposition: disposition }],
        rationale: 'Only the registered original customer response is interpreted.', recommendedDisposition: disposition,
        responseMessage: 'Your exact response has been received.',
      })
    }
    if (formatName === 'agency_research_brief_answers') {
      const input = z.object({ originalText: z.string(), questions: z.array(z.object({ question_id: z.string(), brief_field: z.string() })) }).parse(raw)
      if (!answerInvitation || input.originalText !== answerInvitation.text) throw new Error('Brief answer mapping lacks the exact registered client response')
      calls.push('agency_research.brief_answers')
      return briefAnswerAgentResultSchema.parse({ kind: 'research', data: { answers: input.questions.map((question) => {
        const invited = answerInvitation!.questions.find((item) => item.question_id === question.question_id && item.brief_field === question.brief_field)
        const quote = CLIENT_ANSWERS[question.brief_field]
        if (!invited || !quote || !input.originalText.includes(quote)) throw new Error('Fixture answer is outside the invitation or original response')
        return { questionId: question.question_id, value: quote, quote }
      }) } })
    }
    const agentId = known.get(formatName)
    if (!agentId) return undefined
    calls.push(agentId)
    const generated = await fixture(agentId, raw, { runTimeoutMs: 1000, tier: 'fixture' })
    const result = structuredClone(generated.result) as { kind: string; data: Record<string, unknown> }
    if (agentId === 'agency_research.field_mapper') {
      const input = fieldMapperInputSchema.parse(raw)
      const mapped = fieldMapperResult.parse(result)
      const assumptions = input.seeded_rows.find((field) => field.field_key === 'open_assumptions')
      if (assumptions && !mapped.data.field_map.some((field) => field.field_key === assumptions.field_key)) {
        mapped.data.field_map.push({
          field_key: assumptions.field_key, proposed_value: assumptions.field_description,
          evidence_ids: [], provenance: 'inferred', readiness: 'conditional',
          decision_state: 'not_required', status: 'hypothesis',
          reason: 'Open assumptions summarize the unresolved field decisions; they do not assert a client selection or new evidence.',
        })
      }
      return mapped
    }
    if (agentId.startsWith('agency_research.brief_writer.')) {
      const input = briefWriterInputSchema.parse(raw)
      // The fixture model revises prose from real persisted client-answer fields.
      // Decision states, QA verdict and version/approval records remain producer-owned.
      for (const key of ['priority_offer', 'priority_audience', 'business_direction']) {
        const answered = input.field_map.find((field) => field.field_key === key && field.status === 'client_decision')
        if (answered?.proposed_value && result.data[key]) {
          result.data[key] = { ...result.data[key] as object, value: answered.proposed_value }
        }
      }
    }
    if (agentId === 'agency_research.readiness_assessor') {
      const input = readinessAssessorInputSchema.parse(raw)
      const assessment = readinessAssessorResult.parse(result)
      for (const row of assessment.data.readiness) {
        const fields = row.input_fields.map((key) => input.field_map.find((field) => field.field_key === key)).filter(Boolean)
        if (fields.length && fields.every((field) => field!.readiness !== 'blocked' && field!.decision_state !== 'awaiting_client')) {
          row.state = 'conditional'
          row.missing = 'Client direction is recorded; publication permissions and contact verification are not granted by this response.'
          row.owner = 'agencja'
        }
      }
      return assessment
    }
    return result
  }
  return { resolveStructured, calls,
    allowAnswers: (value: NonNullable<typeof answerInvitation>) => { answerInvitation = value },
    allowBriefApproval: (value: ExactReview) => { approval = value },
    allowPairApproval: (value: NonNullable<typeof pair>) => { pair = value },
  }
}
