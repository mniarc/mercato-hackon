import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'

/** Immutable accepted clarification and its native wait-step evidence; not a lifecycle mirror. */
@Entity({ tableName: 'agency_client_replies' })
@Unique({ name: 'agency_client_replies_event_unique', properties: ['tenantId', 'organizationId', 'customerEntityId', 'submissionId', 'channel', 'eventId'] })
export class AgencyClientReply {
  [OptionalProps]?: 'createdAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'submission_id', type: 'uuid' })
  submissionId!: string

  @Property({ name: 'submitted_by_customer_user_id', type: 'uuid' })
  submittedByCustomerUserId!: string

  @Property({ type: 'text' })
  channel!: string

  @Property({ name: 'event_id', type: 'text' })
  eventId!: string

  @Property({ type: 'jsonb' })
  original!: Record<string, unknown>

  @Property({ name: 'workflow_instance_id', type: 'uuid' })
  workflowInstanceId!: string

  @Property({ name: 'step_instance_id', type: 'uuid' })
  stepInstanceId!: string

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}

@Entity({ tableName: 'agency_cases' })
@Index({
  name: 'agency_cases_scope_idx',
  properties: ['tenantId', 'organizationId', 'deletedAt', 'createdAt'],
})
@Index({
  name: 'agency_cases_customer_idx',
  properties: ['tenantId', 'organizationId', 'customerEntityId', 'deletedAt', 'createdAt'],
})
@Index({
  name: 'agency_cases_material_attachment_idx',
  properties: ['tenantId', 'organizationId', 'materialAttachmentId'],
})
export class AgencyCase {
  [OptionalProps]?:
    | 'workflowInstanceId'
    | 'createdAt'
    | 'updatedAt'
    | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'submitted_by_customer_user_id', type: 'uuid' })
  submittedByCustomerUserId!: string

  @Property({ type: 'text' })
  title!: string

  @Property({ name: 'agent_worker_id', type: 'text' })
  agentWorkerId!: string

  @Property({ name: 'material_attachment_id', type: 'uuid' })
  materialAttachmentId!: string

  @Property({ name: 'material_file_name', type: 'text' })
  materialFileName!: string

  @Property({ name: 'material_mime_type', type: 'text' })
  materialMimeType!: string

  @Property({ name: 'material_file_size', type: 'int' })
  materialFileSize!: number

  @Property({ name: 'workflow_instance_id', type: 'uuid', nullable: true })
  workflowInstanceId: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({
    name: 'updated_at',
    type: Date,
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
    nullable: true,
  })
  updatedAt?: Date | null

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}

/** Append-only client input. Execution and decisions live in the linked native workflow. */
@Entity({ tableName: 'agency_client_submissions' })
@Unique({ name: 'agency_client_submissions_event_unique', properties: ['tenantId', 'organizationId', 'customerEntityId', 'caseId', 'channel', 'eventId'] })
export class AgencyClientSubmission {
  [OptionalProps]?: 'workflowInstanceId' | 'createdAt' | 'deletedAt'

  @PrimaryKey({ type: 'uuid', defaultRaw: 'gen_random_uuid()' })
  id!: string

  @Property({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string

  @Property({ name: 'organization_id', type: 'uuid' })
  organizationId!: string

  @Property({ name: 'customer_entity_id', type: 'uuid' })
  customerEntityId!: string

  @Property({ name: 'case_id', type: 'uuid' })
  caseId!: string

  @Property({ name: 'submitted_by_customer_user_id', type: 'uuid' })
  submittedByCustomerUserId!: string

  @Property({ type: 'text' })
  channel!: string

  @Property({ name: 'event_id', type: 'text' })
  eventId!: string

  @Property({ type: 'jsonb' })
  original!: Record<string, unknown>

  @Property({ name: 'workflow_instance_id', type: 'uuid', nullable: true })
  workflowInstanceId: string | null = null

  @Property({ name: 'created_at', type: Date, onCreate: () => new Date() })
  createdAt: Date = new Date()

  @Property({ name: 'deleted_at', type: Date, nullable: true })
  deletedAt: Date | null = null
}
