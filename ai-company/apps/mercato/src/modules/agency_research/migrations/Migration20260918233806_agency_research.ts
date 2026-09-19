import { Migration } from '@mikro-orm/migrations';

export class Migration20260918233806_agency_research extends Migration {

  override name = 'Migration20260918233806';

  override up(): void | Promise<void> {
    this.addSql(`create table "agency_research_documents" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "order_ref" text not null, "brand" text not null, "template_id" text not null, "output_id" text not null, "status" text not null, "current_version_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "agency_research_documents" add constraint "agency_research_documents_order_template_uq" unique ("tenant_id", "organization_id", "order_ref", "template_id");`);

    this.addSql(`create table "agency_research_document_versions" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "document_id" uuid not null, "order_ref" text not null, "template_id" text not null, "version_no" int not null, "schema_version" text not null, "status" text not null, "input_versions" jsonb not null, "field_evidence" jsonb not null, "approval_records" jsonb not null, "simulation_flag" boolean not null, "data" jsonb not null, "issues" jsonb not null, "rendered_md" text not null, "client_view_md" text null, "task_run_id" uuid not null, "qa_result" jsonb null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_research_document_versions_order_idx" on "agency_research_document_versions" ("tenant_id", "organization_id", "order_ref", "template_id", "version_no");`);
    this.addSql(`alter table "agency_research_document_versions" add constraint "agency_research_document_versions_no_uq" unique ("document_id", "version_no");`);

    this.addSql(`create table "agency_research_sources" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "order_ref" text not null, "source_id" text not null, "canonical_source_id" text not null, "independent_material_id" text null, "url" text not null, "publisher" text not null, "kind" text not null, "channel" text not null, "origin" text not null, "access" text not null, "title" text null, "retrieved_at" timestamptz not null, "published_at" timestamptz null, "content_md" text null, "content_sha256" text null, "bytes" int not null, "read_scope" text not null, "limitation" text null, "task_run_id" uuid not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "agency_research_sources" add constraint "agency_research_sources_order_source_uq" unique ("tenant_id", "organization_id", "order_ref", "source_id");`);

    this.addSql(`create table "agency_research_task_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "order_ref" text not null, "brand" text not null, "step_id" text not null, "attempt" int not null, "status" text not null, "runner" text not null, "models" jsonb not null, "input_versions" jsonb not null, "output_version_id" uuid null, "summary" jsonb null, "qa_result" jsonb null, "agent_run_ids" jsonb not null, "cost" jsonb null, "error" text null, "finished_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_research_task_runs_order_idx" on "agency_research_task_runs" ("tenant_id", "organization_id", "order_ref", "step_id", "created_at");`);
  }

}
