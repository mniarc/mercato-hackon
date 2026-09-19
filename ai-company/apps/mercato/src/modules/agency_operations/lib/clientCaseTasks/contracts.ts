import { z } from 'zod'

export const clientCaseTasksSchema = z.object({
  caseId: z.uuid(),
  state: z.enum(['customer_tasks', 'no_open_customer_task']),
  tasks: z.array(z.object({
    id: z.uuid(), title: z.string(), status: z.enum(['PENDING', 'IN_PROGRESS']),
    assignedToYou: z.boolean(),
  })),
})
export type ClientCaseTasks = z.infer<typeof clientCaseTasksSchema>
