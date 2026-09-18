import { Migration } from '@mikro-orm/migrations';

export class Migration20260918215957_agency_operations extends Migration {

  override name = 'Migration20260918215957';

  override up(): void | Promise<void> {
    this.addSql(`create table "agency_client_submissions" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "customer_entity_id" uuid not null, "case_id" uuid not null, "submitted_by_customer_user_id" uuid not null, "channel" text not null, "event_id" text not null, "original" jsonb not null, "workflow_instance_id" uuid null, "created_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "agency_client_submissions" add constraint "agency_client_submissions_event_unique" unique ("tenant_id", "organization_id", "customer_entity_id", "case_id", "channel", "event_id");`);
  }

}
