import { createModuleEvents } from '@open-mercato/shared/modules/events'

export const eventsConfig = createModuleEvents({
  moduleId: 'agency_operations',
  events: [{ id: 'agency_operations.strategy.specialist_waiting', label: 'Strategy waiting for specialist ToV', category: 'lifecycle' }] as const,
})
export const emitAgencyOperationsEvent = eventsConfig.emit
export default eventsConfig
