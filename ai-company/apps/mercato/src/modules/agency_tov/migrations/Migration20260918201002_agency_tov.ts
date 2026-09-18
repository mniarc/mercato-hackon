import { Migration } from '@mikro-orm/migrations';

export class Migration20260918201002_agency_tov extends Migration {

  override name = 'Migration20260918201002';

  override up(): void | Promise<void> {
    this.addSql(`create table "agency_tov_documents" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "brand" text not null, "kind" text not null, "profile_url" text not null default '', "title" text not null, "current_version_id" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "agency_tov_documents" add constraint "agency_tov_documents_kind_uq" unique ("tenant_id", "organization_id", "brand", "kind", "profile_url");`);

    this.addSql(`create table "agency_tov_document_versions" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "document_id" uuid not null, "version_no" int not null, "research_run_id" uuid not null, "body" text not null, "rendered_md" text not null, "citations" jsonb not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_tov_document_versions_run_idx" on "agency_tov_document_versions" ("tenant_id", "organization_id", "research_run_id");`);
    this.addSql(`alter table "agency_tov_document_versions" add constraint "agency_tov_document_versions_no_uq" unique ("document_id", "version_no");`);

    this.addSql(`create table "agency_tov_posts" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "source_id" uuid not null, "scrape_run_id" uuid not null, "external_id" text not null, "url" text not null, "author_name" text not null, "posted_at" timestamptz not null, "text" text not null, "likes" int not null, "comments" int not null, "shares" int not null, "media" text not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_tov_posts_source_idx" on "agency_tov_posts" ("tenant_id", "organization_id", "source_id", "posted_at");`);
    this.addSql(`alter table "agency_tov_posts" add constraint "agency_tov_posts_external_uq" unique ("tenant_id", "organization_id", "source_id", "external_id");`);

    this.addSql(`create table "agency_tov_research_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "brand" text not null, "output_language" text not null, "runner" text not null, "models" jsonb not null, "status" text not null, "error" text null, "post_ids" jsonb not null, "post_count" int not null, "profile_count" int not null, "stats" jsonb null, "grounding_report" jsonb null, "finished_at" timestamptz null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_tov_research_runs_scope_idx" on "agency_tov_research_runs" ("tenant_id", "organization_id", "brand", "created_at");`);

    this.addSql(`create table "agency_tov_scrape_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "brand" text not null, "mode" text not null, "targets" jsonb not null, "reports" jsonb not null, "posts_added" int not null, "posts_existing" int not null, "posts_skipped" int not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "agency_tov_scrape_runs_scope_idx" on "agency_tov_scrape_runs" ("tenant_id", "organization_id", "created_at");`);

    this.addSql(`create table "agency_tov_sources" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "source" text not null, "profile_url" text not null, "display_name" text not null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "agency_tov_sources" add constraint "agency_tov_sources_profile_uq" unique ("tenant_id", "organization_id", "source", "profile_url");`);
  }

}
