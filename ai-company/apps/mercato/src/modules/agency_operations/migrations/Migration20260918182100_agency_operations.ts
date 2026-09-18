import { Migration } from '@mikro-orm/migrations';

export class Migration20260918182100_agency_operations extends Migration {

  override name = 'Migration20260918182100';

  override up(): void | Promise<void> {
    this.addSql(`create table "agency_cases" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "customer_entity_id" uuid not null, "submitted_by_customer_user_id" uuid not null, "title" text not null, "agent_worker_id" text not null, "material_attachment_id" uuid not null, "material_file_name" text not null, "material_mime_type" text not null, "material_file_size" int not null, "workflow_instance_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "agency_cases_material_attachment_idx" on "agency_cases" ("tenant_id", "organization_id", "material_attachment_id");`);
    this.addSql(`create index "agency_cases_customer_idx" on "agency_cases" ("tenant_id", "organization_id", "customer_entity_id", "deleted_at", "created_at");`);
    this.addSql(`create index "agency_cases_scope_idx" on "agency_cases" ("tenant_id", "organization_id", "deleted_at", "created_at");`);
  }

}
