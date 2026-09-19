import { z } from 'zod'
import { STAFF_TOV_COMPLETION_HANDLER } from '../lib/tovIntake/contracts'
import { STRATEGY_SPECIALIST_WAIT_EVENT } from '../lib/strategyExecution/contracts'
import type { SpecialistContinuationHandler } from '../lib/strategyExecution/specialistContinuation'

export const metadata = {
  id: 'agency_operations:strategy-specialist-waiting', event: STRATEGY_SPECIALIST_WAIT_EVENT, persistent: true,
}

export default async function onStrategySpecialistWaiting(raw: unknown, context: { resolve<T>(name: string): T }) {
  const input = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), workflowInstanceId: z.uuid() }).safeParse(raw)
  if (!input.success) return
  await context.resolve<SpecialistContinuationHandler>(STAFF_TOV_COMPLETION_HANDLER).checkWaiting(input.data)
}
