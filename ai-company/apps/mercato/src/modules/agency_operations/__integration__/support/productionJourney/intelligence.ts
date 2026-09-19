import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileAppSourceFile } from '@open-mercato/shared/lib/bootstrap/dynamicLoader'
import { z } from 'zod'
import { createFixtureRunner } from '../../../../agency_research/lib/runners'
import { briefWriterInputSchema } from '../../../../agency_research/data/agents/brief'
import { fieldMapperInputSchema, fieldMapperResult, readinessAssessorInputSchema, readinessAssessorResult } from '../../../../agency_research/data/agents/findings'
import { briefAnswerAgentResultSchema } from '../../../../agency_research/lib/briefRevision/contracts'
import { clientTriageInterpretationSchema, inputSchema } from '../../../agents/client-triage/contract'
import type { NativeStructuredFixtureHook } from '../nativeTriageProvider'
import { createSelectedPostIntelligence } from '../postIntelligence'
import { postAuthorInputSchema, postEditorInputSchema } from '../../../../agency_research/data/agents/post'

export const SUPPLEMENTARY_MATERIAL_TEXT = 'This file is private background material. It does not approve documents, publication, additional spending, or changes to the purchased scope.'

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
  let extractorSchema: Promise<typeof import('../../../../agency_research/data/validators')['pageExtractorResult']> | undefined
  function loadExtractorSchema() {
    // Bundle the real validator's JSON dependencies at the fixture boundary.
    return extractorSchema ??= (async () => {
      const output = await compileAppSourceFile(path.join(appRoot, 'src/modules/agency_research/data/validators.ts'), {
        appRoot, outFile: path.join(appRoot, '.mercato/agency-dev/production-journey-extractor-schema.mjs'), format: 'esm',
      })
      const validators = await import(pathToFileURL(output).href) as typeof import('../../../../agency_research/data/validators')
      return validators.pageExtractorResult
    })()
  }
  const sources = path.join(appRoot, 'src/modules/agency_research/__fixtures__/flow')
  const canned = path.join(sources, 'canned')
  const fixture = createFixtureRunner(canned)
  const extractorByFile: Record<string, string> = {
    'pages/home.md': 'S-01', 'pages/flowco.md': 'S-01',
    'pages/northlight.md': 'S-07', 'pages/northlight-oferta.md': 'S-08', 'pages/kubik.md': 'S-10',
  }
  const extractorByPost: Record<string, string> = {
    '7460000000000000001': 'S-04', '7498366780621524993': 'S-05', '7473006910787674113': 'S-06',
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(sources, 'manifest.json'), 'utf8')) as Record<string, { file?: string }>
  const social = JSON.parse(fs.readFileSync(path.join(sources, 'social.json'), 'utf8')) as { posts: { id: string; url: string }[] }
  const extractorByUrl = new Map<string, string>()
  for (const [url, entry] of Object.entries(manifest)) {
    if (entry.file && extractorByFile[entry.file]) extractorByUrl.set(url, extractorByFile[entry.file])
  }
  for (const post of social.posts) {
    if (extractorByPost[post.id]) extractorByUrl.set(post.url, extractorByPost[post.id])
  }
  const known = new Map<string, string>()
  for (const file of fs.readdirSync(canned).filter((name) => name.endsWith('.json'))) {
    let id = file.slice(0, -5)
    if (id.startsWith('agency_research.page_extractor.')) id = 'agency_research.page_extractor'
    if (id.startsWith('agency_research.tov_writer.')) id = 'agency_research.tov_writer'
    if (id.startsWith('agency_research.plan_writer.topics.')) id = 'agency_research.plan_writer.topics'
    known.set(id.replace(/\W+/g, '_'), id)
  }
  const calls: string[] = []
  const postIntelligence = createSelectedPostIntelligence()
  let answerInvitation: (ExactReview & { text: string; questions: InvitedQuestion[] }) | undefined
  let approval: ExactReview | undefined
  let pair: { taskId: string; strategy: { documentId: string; versionId: string }; tov: { documentId: string; versionId: string } } | undefined
  let material: { text: string; attachmentId?: string } | undefined
  let plan: (ExactReview & { selectedTopicId: string }) | undefined
  let post: ExactReview | undefined
  let production: { caseId: string; planVersion: string; selectedTopicId: string; selectionSubmissionId: string } | undefined

  const resolveStructured: NativeStructuredFixtureHook = async ({ formatName, userTexts }) => {
    const objects = userTexts.flatMap((text) => { try { return [JSON.parse(text)] } catch { return [] } })
    if (objects.length !== 1) return undefined
    const raw = objects[0]
    if (formatName === 'agency_operations_client_triage') {
      const parsed = inputSchema.safeParse(raw)
      if (!parsed.success) return undefined
      const original = parsed.data.original
      if (material && original.text === material.text && original.materialAttachmentId
        && !original.reviewResponse && !original.strategyReviewResponse && !original.planReviewResponse && !original.postReviewResponse) {
        if (material.attachmentId && material.attachmentId !== original.materialAttachmentId) throw new Error('Material fixture received another attachment')
        material.attachmentId = original.materialAttachmentId
        calls.push('agency_operations.client_triage')
        return clientTriageInterpretationSchema.parse({
          parts: [{ intent: 'material', summary: 'Customer supplied supplementary background material.',
            rationale: 'The registered original explicitly grants no approval or additional authority.', needsClarification: false, recommendedDisposition: 'answer' }],
          rationale: 'Acknowledge the saved material; an attachment identifier alone is not file content.',
          recommendedDisposition: 'answer', responseMessage: 'Your supplementary material was saved to the case. This is not approval or confirmation of analysis.',
        })
      }
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
      const planResponse = original.planReviewResponse
      const approvePlan = plan && planResponse?.kind === 'approval' && planResponse.approvePlan === true
        && planResponse.taskId === plan.taskId && planResponse.plan.documentId === plan.documentId
        && planResponse.plan.versionId === plan.versionId && planResponse.selectedTopicId === plan.selectedTopicId
        && original.documentVersionReference === plan.versionId
      const postResponse = original.postReviewResponse
      const approvePost = post && postResponse?.kind === 'approval' && postResponse.approveContent === true
        && !postResponse.publicationConsent && postResponse.taskId === post.taskId
        && postResponse.post.documentId === post.documentId && postResponse.post.versionId === post.versionId
        && original.documentVersionReference === post.versionId
      if (!change && !approveBrief && !approvePair && !approvePlan && !approvePost) return undefined
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
    if (formatName === 'agency_research_post_author' || formatName === 'agency_research_post_editor') {
      if (!production) throw new Error('Post intelligence requires the actual registered client topic selection')
      const author = formatName === 'agency_research_post_author'
      const input = (author ? postAuthorInputSchema : postEditorInputSchema).parse(raw)
      const selected = input.selected_item
      if (selected.plan_id !== `KLI-PLAN@${production.caseId}` || selected.plan_version !== production.planVersion
        || selected.topic_id !== production.selectedTopicId || selected.decision_id !== production.selectionSubmissionId
        || selected.selection_status !== 'client_selected') throw new Error('Post intelligence is outside the saved plan selection')
      const agentId = author ? 'agency_research.post_author' : 'agency_research.post_editor'
      calls.push(agentId)
      return (await postIntelligence(agentId, input, { runTimeoutMs: 1000, tier: 'fixture' })).result
    }
    const agentId = known.get(formatName)
    if (!agentId) return undefined
    calls.push(agentId)
    if (agentId === 'agency_research.page_extractor' && raw?.page?.url?.startsWith('attachment://')) {
      if (!material?.attachmentId || raw.page.url !== `attachment://${material.attachmentId}`
        || raw.page.content_md?.trim() !== material.text.trim()) throw new Error('Private material extraction lacks the exact registered native attachment/text')
      return (await loadExtractorSchema()).parse({ kind: 'research', data: {
        facts: [], language_samples: [], audience_signals: [],
        page_summary: 'Private background note explicitly withholding document approval, publication permission, additional spending and purchased-scope changes; no business evidence or audience claims.',
      } })
    }
    let fixtureInput = raw
    if (agentId === 'agency_research.page_extractor') {
      const fixtureId = extractorByUrl.get(raw?.page?.url)
      if (!fixtureId) throw new Error(`No registered extractor intelligence for source URL ${raw?.page?.url}`)
      // Legacy canned filenames identify authored intelligence, not the producer's current source numbering.
      fixtureInput = { ...raw, page: { ...raw.page, source_id: fixtureId } }
    }
    const generated = await fixture(agentId, fixtureInput, { runTimeoutMs: 1000, tier: 'fixture' })
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
    allowMaterial: (value: { text: string; attachmentId?: string }) => {
      if (value.text !== SUPPLEMENTARY_MATERIAL_TEXT) throw new Error('Material fixture requires the registered no-authority background note')
      if (material?.attachmentId && value.attachmentId && material.attachmentId !== value.attachmentId) throw new Error('Material fixture cannot replace its actual attachment')
      material = { text: value.text, attachmentId: value.attachmentId ? z.uuid().parse(value.attachmentId) : material?.attachmentId }
    },
    allowAnswers: (value: NonNullable<typeof answerInvitation>) => { answerInvitation = value },
    allowBriefApproval: (value: ExactReview) => { approval = value },
    allowPairApproval: (value: NonNullable<typeof pair>) => { pair = value },
    allowPlanApproval: (value: NonNullable<typeof plan>) => { plan = value },
    allowPostProduction: (value: NonNullable<typeof production>) => { production = value },
    allowPostApproval: (value: ExactReview) => { post = value },
  }
}
