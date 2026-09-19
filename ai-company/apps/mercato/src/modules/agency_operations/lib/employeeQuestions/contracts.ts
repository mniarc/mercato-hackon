import { z } from 'zod'

export const EMPLOYEE_QUESTION_SERVICE = 'agencyEmployeeQuestionService'
export const EMPLOYEE_QUESTION_WORKFLOW_ID = 'agency_operations.employee-question.v1'
export const EMPLOYEE_QUESTION_RESPONSE_FUNCTION = 'agency_operations.receiveEmployeeQuestionResponse'
export const EMPLOYEE_QUESTION_METADATA_KEY = 'agencyEmployeeQuestion'
export const EMPLOYEE_QUESTION_ANSWER_KEY = 'employeeQuestionAnswer'

export const employeeQuestionRequestSchema = z.object({
  parentTaskId: z.uuid(), question: z.string().trim().min(1).max(4000),
  eventId: z.string().min(1).max(200), documentVersionId: z.uuid().optional(),
}).strict()

export const employeeQuestionBindingSchema = employeeQuestionRequestSchema.extend({
  caseId: z.uuid(), parentWorkflowInstanceId: z.uuid(), employeeUserId: z.uuid(),
  customerUserId: z.uuid(), customerEntityId: z.uuid(),
}).strict()

export type EmployeeQuestionActor = { tenantId: string; organizationId: string; userId: string; roleNames: string[]; caseId: string }
export type EmployeeQuestionRequest = z.infer<typeof employeeQuestionRequestSchema>
export type EmployeeQuestionBinding = z.infer<typeof employeeQuestionBindingSchema>
export type EmployeeQuestionItem = {
  workflowInstanceId: string; parentTaskId: string; question: string; documentVersionId: string | null;
  employeeUserId: string; createdAt: string; workflowStatus: string;
  customerTaskId: string | null; customerTaskStatus: string | null;
  answer: string | null; submissionId: string | null;
}
export type EmployeeQuestionList = {
  configured: boolean;
  documents: { versionId: string; documentCode: string; versionLabel: string }[];
  parents: { taskId: string; taskName: string; status: string; canAsk: boolean }[];
  questions: EmployeeQuestionItem[];
}
export type EmployeeQuestionService = {
  list(input: EmployeeQuestionActor): Promise<EmployeeQuestionList>;
  ask(input: EmployeeQuestionActor & EmployeeQuestionRequest): Promise<{ workflowInstanceId: string; customerTaskId: string; replayed: boolean }>;
  receiveResponse(input: unknown, context: unknown): Promise<{ submissionId: string; replayed: boolean }>;
}
