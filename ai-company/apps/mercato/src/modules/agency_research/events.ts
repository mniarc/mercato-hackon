import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Payloads carry ids, step and status only — never document text. The case card
 * and the customer portal refetch on them (DOM Event Bridge).
 */
const events = [
  { id: 'agency_research.document.versioned', label: 'Research document versioned', entity: 'document', category: 'lifecycle', clientBroadcast: true },
  { id: 'agency_research.task.completed', label: 'Research task completed', entity: 'task', category: 'lifecycle', clientBroadcast: true },
  { id: 'agency_research.task.escalated', label: 'Research task escalated', entity: 'task', category: 'lifecycle', clientBroadcast: true },
  { id: 'agency_research.budget.paused', label: 'Research budget paused', entity: 'task', category: 'lifecycle', clientBroadcast: true },
] as const

export const agencyResearchEvents = createModuleEvents({ moduleId: 'agency_research', events })

export default agencyResearchEvents
