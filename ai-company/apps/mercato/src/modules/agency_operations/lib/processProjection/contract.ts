import { z } from 'zod'
import { clientSubmissionDispositionSchema, clientSubmissionRequestSchema } from '../contracts/clientSubmission'
import { clientTriageInterpretationSchema } from '../../agents/client-triage/contract'
import { analysisProcessResultSchema } from '../analysisProcess/contracts'

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
