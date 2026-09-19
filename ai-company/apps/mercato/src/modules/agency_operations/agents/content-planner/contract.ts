import { z } from 'zod'

export const sourceStoryIds = ['F26-2'] as const

const versionReferenceSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
})
const documentSchema = z.object({ reference: versionReferenceSchema, content: z.string().min(1) })
const topicSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1),
  strategyPillar: z.string().min(1),
  objective: z.string().min(1),
  angle: z.string().min(1),
  argument: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  callToAction: z.string().min(1),
  channel: z.string().min(1),
  proposedDay: z.number().int().min(1).max(30),
})

export const inputSchema = z.object({
  brief: documentSchema,
  strategy: documentSchema,
  toneOfVoice: documentSchema,
  catalog: z.object({ reference: versionReferenceSchema, topicCount: z.number().int().positive() }),
  channel: z.string().min(1),
  outputLanguage: z.string().min(1),
  analyses: z.array(documentSchema),
  sources: z.array(z.object({ sourceId: z.string().min(1), content: z.string().min(1) })),
  previousPlan: z.object({ reference: versionReferenceSchema, topics: z.array(topicSchema) }).nullable(),
  revision: z.object({ directiveId: z.string().min(1), requestedChange: z.string().min(1) }).nullable(),
})

export const outputSchema = z.object({
  status: z.enum(['proposed', 'blocked']),
  basisVersions: z.array(versionReferenceSchema),
  plan: z.object({
    horizonDays: z.literal(30),
    channel: z.string().min(1),
    topics: z.array(topicSchema).min(1),
    recommendedTopicId: z.string().min(1),
    recommendationReason: z.string().min(1),
  }).nullable(),
  dependentChanges: z.array(z.object({ topicId: z.string().min(1), reason: z.string().min(1) })),
  missingInputs: z.array(z.string().min(1)),
})

export type ContentPlannerInput = z.infer<typeof inputSchema>
export type ContentPlannerOutput = z.infer<typeof outputSchema>
