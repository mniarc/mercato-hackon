import type { z } from 'zod'
import type { editorReviewSchema } from '../../data/schemas/post'

export type PostReviewQa =
  | { state: 'missing' }
  | { state: 'unavailable'; taskRunId: string; status: string }
  | { state: 'assessed'; taskRunId: string; status: 'done' | 'to_fix'; verdict: z.infer<typeof editorReviewSchema>['result'] }

/** Editorial evidence only: neither content acceptance nor publication consent. */
export type PostReviewProjection = {
  orderRef: string
  documentId: string
  versionId: string
  version: string
  templateId: 'WZR-POST'
  isCurrent: boolean
  documentStatus: string
  versionStatus: string
  clientViewMd: string | null
  simulationFlag: boolean
  qa: PostReviewQa
}
