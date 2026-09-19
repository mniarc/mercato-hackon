import { z } from 'zod'

export const sourceStoryIds = ['F30-2'] as const

const versionReferenceSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
})
const documentSchema = z.object({ reference: versionReferenceSchema, content: z.string().min(1) })

export const inputSchema = z.object({
  instruction: z.object({
    reference: versionReferenceSchema,
    topicId: z.string().min(1),
    topic: z.string().min(1),
    objective: z.string().min(1),
    audience: z.string().min(1),
    arguments: z.array(z.object({ claim: z.string().min(1), sourceIds: z.array(z.string().min(1)).min(1) })),
    callToAction: z.string().min(1),
    style: z.string().min(1),
    channel: z.string().min(1),
    language: z.string().min(1),
    requirements: z.array(z.string().min(1)),
    exclusions: z.array(z.string().min(1)),
    agreedLinks: z.array(z.string().url()),
    agreedMentions: z.array(z.string().min(1)),
  }),
  foundations: z.object({ brief: documentSchema, strategy: documentSchema, toneOfVoice: documentSchema, plan: documentSchema }),
  sources: z.array(z.object({ sourceId: z.string().min(1), content: z.string().min(1) })),
  previousPost: documentSchema.nullable(),
  revision: z.object({ directiveId: z.string().min(1), requestedChange: z.string().min(1) }).nullable(),
})

export const outputSchema = z.object({
  status: z.enum(['proposed', 'blocked']),
  instructionVersion: versionReferenceSchema,
  basisVersions: z.array(versionReferenceSchema),
  topicId: z.string().min(1),
  post: z.object({
    text: z.string().min(1),
    hook: z.string().min(1),
    argument: z.string().min(1),
    callToAction: z.string().min(1),
    links: z.array(z.string().url()),
    mentions: z.array(z.string().min(1)),
    claims: z.array(z.object({ claim: z.string().min(1), sourceIds: z.array(z.string().min(1)).min(1) })),
  }).nullable(),
  changes: z.array(z.object({ section: z.string().min(1), reason: z.string().min(1), dependent: z.boolean() })),
  missingInputs: z.array(z.string().min(1)),
})

export type PostCopywriterInput = z.infer<typeof inputSchema>
export type PostCopywriterOutput = z.infer<typeof outputSchema>
