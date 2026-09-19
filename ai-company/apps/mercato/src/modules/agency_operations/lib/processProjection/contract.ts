import { z } from 'zod'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { clientTriageInterpretationSchema } from '../../agents/client-triage/contract'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'
import { postInstructionExecutionResultSchema, strategyProcessReferenceSchema, publicationPreparationResultSchema } from '@/modules/agency_research/lib/contracts'
import { strategyExecutionActivityResultSchema, strategyReviewHandoffResultSchema } from '../strategyExecution/contracts'
import { planningExecutionActivityResultSchema, planningReviewHandoffResultSchema } from '../planningExecution/contracts'
import { postExecutionActivityResultSchema } from '../postExecution/contracts'
import { briefRevisionActivityResultSchema } from '../briefRevision/contracts'

export const caseBriefRevisionHandoffSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('invited'), versionId: z.uuid(),
    invitation: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }),
    questions: z.array(z.object({ questionId: z.string(), question: z.string() })),
  }),
  z.object({ status: z.literal('blocked'), invitation: z.null(), reason: z.string().min(1), revision: briefRevisionActivityResultSchema }),
])

const strategyDocumentReferenceSchema = z.object({
  documentId: z.string().min(1), versionId: z.string().min(1),
  documentRef: z.string().min(1), version: z.string().min(1), templateId: z.string().min(1),
})

export const caseStrategyHandoffSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('not_ready'), orderRef: z.string().min(1),
    reason: z.string().min(1), templateId: z.string().optional(),
  }),
  z.object({
    status: z.literal('ready'), orderRef: z.string().min(1),
    brief: strategyDocumentReferenceSchema,
    analysis: z.object({
      freezeTaskRunId: z.string().min(1), qaTaskRunId: z.string().min(1),
      setHash: z.string().min(1), documents: z.array(strategyDocumentReferenceSchema),
    }),
    process: strategyProcessReferenceSchema,
  }),
])

const pairDocumentReferenceSchema = z.object({ documentId: z.uuid(), versionId: z.uuid(), version: z.string() })
const pairAcceptanceSchema = z.object({
  orderRef: z.string().min(1),
  pair: z.object({ strategy: pairDocumentReferenceSchema, tov: pairDocumentReferenceSchema }),
  brief: pairDocumentReferenceSchema,
  remainingDocuments: z.array(z.enum(['strategy', 'tov'])),
})
const pairNotReadySchema = z.object({ status: z.literal('not_ready'), orderRef: z.string().min(1), reason: z.string().min(1) })

export const caseStrategyPairContinuationSchema = z.discriminatedUnion('status', [
  pairNotReadySchema.extend({ cumulative: pairNotReadySchema }),
  z.object({
    status: z.literal('partial'), orderRef: z.string().min(1),
    cumulative: pairAcceptanceSchema.extend({ status: z.literal('partial') }),
    followUpTask: z.object({ workflowInstanceId: z.uuid(), taskId: z.uuid(), replayed: z.boolean() }),
  }),
  z.object({
    status: z.literal('accepted'), orderRef: z.string().min(1),
    cumulative: pairAcceptanceSchema.extend({ status: z.literal('accepted') }),
    planningReadiness: z.discriminatedUnion('status', [
      pairNotReadySchema,
      z.object({ status: z.literal('ready'), orderRef: z.string().min(1), process: strategyProcessReferenceSchema }),
    ]),
  }),
])

export const caseProcessSubmissionSchema = z.object({
  submissionId: z.uuid(),
  eventId: z.string(),
  createdAt: z.string(),
  original: clientSubmissionRequestSchema,
  workflow: z.object({
    id: z.uuid(),
    workflowId: z.string(),
    version: z.number(),
    status: z.string(),
    currentStepId: z.string(),
    mode: z.enum(['native_agent', 'deterministic_scaffold', 'unknown']),
    waitingFor: z.enum(['client', 'employee']).nullable(),
    routeUnapplied: z.boolean(),
    error: z.string().nullable(),
  }).nullable(),
  disposition: clientSubmissionDispositionSchema.nullable(),
  interpretation: clientTriageInterpretationSchema.nullable(),
  briefRevisionHandoff: caseBriefRevisionHandoffSchema.nullable().optional(),
  strategyHandoff: caseStrategyHandoffSchema.nullable().optional(),
  strategyExecution: strategyExecutionActivityResultSchema.nullable().optional(),
  strategyReviewHandoff: strategyReviewHandoffResultSchema.nullable().optional(),
  strategyPairContinuation: caseStrategyPairContinuationSchema.nullable().optional(),
  planningExecution: planningExecutionActivityResultSchema.nullable().optional(),
  planningReviewHandoff: planningReviewHandoffResultSchema.nullable().optional(),
  postInstruction: postInstructionExecutionResultSchema.nullable().optional(),
  postExecution: postExecutionActivityResultSchema.nullable().optional(),
  publicationPreparation: publicationPreparationResultSchema.nullable().optional(),
  tasks: z.array(z.object({
    id: z.uuid(),
    status: z.string(),
    assignedTo: z.string().nullable(),
    assignedToRoles: z.array(z.string()),
    claimedBy: z.string().nullable(),
  })),
})

export const caseAnalysisProcessSchema = z.object({
  id: z.uuid(),
  workflowId: z.string(),
  version: z.number(),
  status: z.string(),
  currentStepId: z.string(),
  awaitingFollowUp: z.boolean(),
  result: analysisProcessResultSchema.nullable(),
  error: z.string().nullable(),
})

export const caseProcessResponseSchema = z.object({
  caseId: z.uuid(),
  submissions: z.array(caseProcessSubmissionSchema),
  hasMore: z.boolean(),
  analysis: caseAnalysisProcessSchema.nullable().optional(),
})

export type CaseProcessSubmission = z.infer<typeof caseProcessSubmissionSchema>
export type CaseProcessResponse = z.infer<typeof caseProcessResponseSchema>
export type CaseAnalysisProcess = z.infer<typeof caseAnalysisProcessSchema>
