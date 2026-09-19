import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { WorkflowInstance } from '@open-mercato/core/modules/workflows/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AGENCY_TOV_WORKFLOW_ID } from '../lib/tovProcess'
import {
  STAFF_TOV_COMPLETION_HANDLER,
  STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID,
  STAFF_TOV_INTAKE_CONTEXT_KEY,
  staffTovIntakeContextSchema,
  type StaffTovCompletionHandler,
} from '../lib/tovIntake/contracts'

export const metadata = {
  id: 'agency_operations:tov-specialist-completed',
  event: 'workflows.instance.completed',
  persistent: true,
}

const eventSchema = z.object({
  id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid(),
  workflowId: z.literal(AGENCY_TOV_WORKFLOW_ID), status: z.literal('COMPLETED'),
}).passthrough()

type SubscriberContext = { resolve: <T>(name: string) => T }

export default async function onTovSpecialistCompleted(raw: unknown, context: SubscriberContext): Promise<void> {
  const event = eventSchema.safeParse(raw)
  if (!event.success) return
  const scope = { tenantId: event.data.tenantId, organizationId: event.data.organizationId }
  const instance = await findOneWithDecryption(context.resolve<EntityManager>('em'), WorkflowInstance, {
    ...scope, id: event.data.id, workflowId: AGENCY_TOV_WORKFLOW_ID, deletedAt: null,
  }, undefined, scope)
  const intake = staffTovIntakeContextSchema.safeParse(instance?.context?.[STAFF_TOV_INTAKE_CONTEXT_KEY])
  if (!instance || instance.metadata?.entityType !== STAFF_TOV_INTAKE_ATTACHMENT_ENTITY_ID || !intake.success) return
  await context.resolve<StaffTovCompletionHandler>(STAFF_TOV_COMPLETION_HANDLER).complete({
    ...scope, caseId: intake.data.caseId, specialistWorkflowInstanceId: instance.id,
  })
}
