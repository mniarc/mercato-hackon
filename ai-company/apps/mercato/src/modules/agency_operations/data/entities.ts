import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

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
