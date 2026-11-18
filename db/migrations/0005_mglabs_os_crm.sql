CREATE TABLE "ai_usage" (
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"feature" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_workspace_id_day_feature_pk" PRIMARY KEY("workspace_id","day","feature")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid,
	"company_id" uuid,
	"contact_id" uuid,
	"project_id" uuid,
	"kind" text NOT NULL,
	"channel" text,
	"content" text,
	"meta" jsonb,
	"author_id" text,
	"author_kind" text DEFAULT 'user' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_activity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activities_legacy_activity_id_unique" UNIQUE("legacy_activity_id")
);
--> statement-breakpoint
CREATE TABLE "crm_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor" text,
	"actor_kind" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"status" text DEFAULT 'lead' NOT NULL,
	"category" text,
	"website" text,
	"phone" text,
	"email" text,
	"instagram" text,
	"address" text,
	"neighborhood" text,
	"city" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"place_id" uuid,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"instagram" text,
	"preferred_channel" text,
	"source" text,
	"opted_out" boolean DEFAULT false NOT NULL,
	"opted_out_at" timestamp with time zone,
	"notes" text,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"primary_contact_id" uuid,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"service_type" text,
	"estimated_value_cents" bigint,
	"probability" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"owner_id" text,
	"next_step" text,
	"next_step_at" timestamp with time zone,
	"expected_close_at" date,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"last_activity_at" timestamp with time zone,
	"legacy_lead_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deals_legacy_lead_id_unique" UNIQUE("legacy_lead_id")
);
--> statement-breakpoint
CREATE TABLE "crm_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text DEFAULT 'processo' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"company_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_message_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid,
	"company_id" uuid,
	"contact_id" uuid,
	"objective" text NOT NULL,
	"service" text,
	"tone" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"body" text NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"template_id" uuid,
	"facts" jsonb,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"objective" text NOT NULL,
	"service" text,
	"tone" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"receivable_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_at" date NOT NULL,
	"method" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"kind" text DEFAULT 'documento' NOT NULL,
	"rights_status" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"deal_id" uuid,
	"proposal_id" uuid,
	"name" text NOT NULL,
	"service_type" text,
	"scope" text,
	"status" text DEFAULT 'planejado' NOT NULL,
	"phase" text DEFAULT 'briefing' NOT NULL,
	"due_date" date,
	"notes" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposal_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"service_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" bigint DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"deal_id" uuid,
	"company_id" uuid NOT NULL,
	"contact_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"previous_id" uuid,
	"diagnosis" text,
	"scope" text,
	"deliverables" text,
	"timeline" text,
	"revisions_included" integer,
	"payment_terms" text,
	"installments" integer DEFAULT 1 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"valid_until" date,
	"notes" text,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"deal_id" uuid,
	"proposal_id" uuid,
	"description" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" date NOT NULL,
	"installment_no" integer DEFAULT 1 NOT NULL,
	"installments_total" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_scope" text,
	"base_price_cents" bigint,
	"estimated_days" integer,
	"recurring" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'open' NOT NULL,
	CONSTRAINT "crm_stages_ws_key_uq" UNIQUE("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE "crm_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'media' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deal_id" uuid,
	"company_id" uuid,
	"project_id" uuid,
	"assigned_to" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"dedupe_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_audit_events" ADD CONSTRAINT "crm_audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_primary_contact_id_crm_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_stage_id_crm_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."crm_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_knowledge" ADD CONSTRAINT "crm_knowledge_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_knowledge" ADD CONSTRAINT "crm_knowledge_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_drafts" ADD CONSTRAINT "crm_message_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_drafts" ADD CONSTRAINT "crm_message_drafts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_drafts" ADD CONSTRAINT "crm_message_drafts_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_drafts" ADD CONSTRAINT "crm_message_drafts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_drafts" ADD CONSTRAINT "crm_message_drafts_template_id_crm_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."crm_message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_message_templates" ADD CONSTRAINT "crm_message_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_receivable_id_crm_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."crm_receivables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_project_documents" ADD CONSTRAINT "crm_project_documents_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_events" ADD CONSTRAINT "crm_proposal_events_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposal_items" ADD CONSTRAINT "crm_proposal_items_service_id_crm_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."crm_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_proposals" ADD CONSTRAINT "crm_proposals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_receivables" ADD CONSTRAINT "crm_receivables_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_receivables" ADD CONSTRAINT "crm_receivables_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_receivables" ADD CONSTRAINT "crm_receivables_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_receivables" ADD CONSTRAINT "crm_receivables_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_receivables" ADD CONSTRAINT "crm_receivables_proposal_id_crm_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."crm_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_services" ADD CONSTRAINT "crm_services_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_tokens_ws_idx" ON "api_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_activities_deal_idx" ON "crm_activities" USING btree ("deal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_company_idx" ON "crm_activities" USING btree ("company_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_ws_idx" ON "crm_activities" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_audit_ws_idx" ON "crm_audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_companies_ws_place_uq" ON "crm_companies" USING btree ("workspace_id","place_id") WHERE "crm_companies"."place_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_companies_ws_idx" ON "crm_companies" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "crm_companies_name_trgm_idx" ON "crm_companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "crm_contacts_ws_company_idx" ON "crm_contacts" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "crm_deals_ws_stage_idx" ON "crm_deals" USING btree ("workspace_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_company_idx" ON "crm_deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_deals_next_step_idx" ON "crm_deals" USING btree ("workspace_id","next_step_at");--> statement-breakpoint
CREATE INDEX "crm_knowledge_ws_idx" ON "crm_knowledge" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "crm_message_drafts_ws_idx" ON "crm_message_drafts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_payments_ws_idx" ON "crm_payments" USING btree ("workspace_id","paid_at");--> statement-breakpoint
CREATE INDEX "crm_payments_rec_idx" ON "crm_payments" USING btree ("receivable_id");--> statement-breakpoint
CREATE INDEX "crm_projects_ws_idx" ON "crm_projects" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_projects_deal_uq" ON "crm_projects" USING btree ("deal_id") WHERE "crm_projects"."deal_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_proposal_items_idx" ON "crm_proposal_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "crm_proposals_ws_idx" ON "crm_proposals" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "crm_proposals_deal_idx" ON "crm_proposals" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "crm_receivables_ws_due_idx" ON "crm_receivables" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE INDEX "crm_tasks_ws_due_idx" ON "crm_tasks" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_tasks_dedupe_uq" ON "crm_tasks" USING btree ("workspace_id","dedupe_key") WHERE "crm_tasks"."dedupe_key" is not null;--> statement-breakpoint
-- ===== Backfill seguro: leads/activities antigos → entidades do MGLABS OS =====
-- Nada é apagado nem alterado nas tabelas antigas. Cada registro novo guarda o id antigo
-- (legacy_lead_id / legacy_activity_id) e os inserts são idempotentes.
INSERT INTO "workspaces" ("name") SELECT 'MGLABS' WHERE NOT EXISTS (SELECT 1 FROM "workspaces");--> statement-breakpoint
INSERT INTO "crm_stages" ("workspace_id", "key", "label", "position", "probability", "kind")
SELECT w.id, s.key, s.label, s.position, s.probability, s.kind
FROM "workspaces" w
CROSS JOIN (VALUES
  ('novo', 'Novo', 1, 5, 'open'),
  ('qualificado', 'Qualificado', 2, 15, 'open'),
  ('primeiro_contato', 'Primeiro contato', 3, 25, 'open'),
  ('conversa', 'Conversa', 4, 40, 'open'),
  ('reuniao', 'Reunião', 5, 55, 'open'),
  ('proposta', 'Proposta', 6, 65, 'open'),
  ('negociacao', 'Negociação', 7, 80, 'open'),
  ('ganho', 'Fechado ganho', 8, 100, 'won'),
  ('perdido', 'Perdido', 9, 0, 'lost')
) AS s(key, label, position, probability, kind)
ON CONFLICT ("workspace_id", "key") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_companies" ("workspace_id", "name", "status", "category", "website", "phone", "address", "neighborhood", "city", "source", "place_id", "metadata", "created_at", "updated_at")
SELECT (SELECT id FROM "workspaces" ORDER BY created_at LIMIT 1),
       COALESCE(p.name, '(sem nome)'), 'lead', p.category,
       COALESCE(p.website, p.google_website), COALESCE(p.phone, p.google_phone),
       p.address, p.neighborhood, p.city, 'radar', l.place_id,
       jsonb_build_object('legacyLeadId', l.id::text),
       COALESCE(l.created_at, now()), COALESCE(l.updated_at, now())
FROM "leads" l
LEFT JOIN "places" p ON p.id = l.place_id
WHERE NOT EXISTS (SELECT 1 FROM "crm_deals" d WHERE d.legacy_lead_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM "crm_companies" c WHERE c.metadata->>'legacyLeadId' = l.id::text);--> statement-breakpoint
INSERT INTO "crm_deals" ("workspace_id", "company_id", "stage_id", "title", "service_type", "estimated_value_cents", "source", "next_step", "next_step_at", "lost_reason", "won_at", "lost_at", "legacy_lead_id", "last_activity_at", "created_at", "updated_at")
SELECT c.workspace_id, c.id, st.id,
       COALESCE(NULLIF(l.offer, ''), 'Oportunidade') || ' — ' || c.name,
       l.offer,
       CASE WHEN l.expected_value IS NULL THEN NULL ELSE round(l.expected_value * 100)::bigint END,
       'radar', l.next_step, l.next_step_at,
       CASE WHEN l.stage = 'perdido' THEN l.lost_reason END,
       CASE WHEN l.stage = 'fechado' THEN COALESCE(l.updated_at, now()) END,
       CASE WHEN l.stage = 'perdido' THEN COALESCE(l.updated_at, now()) END,
       l.id, l.updated_at, COALESCE(l.created_at, now()), COALESCE(l.updated_at, now())
FROM "leads" l
JOIN "crm_companies" c ON c.metadata->>'legacyLeadId' = l.id::text
JOIN "crm_stages" st ON st.workspace_id = c.workspace_id AND st.key = (
  CASE COALESCE(l.stage, 'novo')
    WHEN 'abordado' THEN 'primeiro_contato'
    WHEN 'respondeu' THEN 'conversa'
    WHEN 'reuniao' THEN 'reuniao'
    WHEN 'proposta' THEN 'proposta'
    WHEN 'fechado' THEN 'ganho'
    WHEN 'perdido' THEN 'perdido'
    ELSE 'novo' END)
ON CONFLICT ("legacy_lead_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_activities" ("workspace_id", "deal_id", "company_id", "kind", "channel", "content", "author_kind", "occurred_at", "legacy_activity_id", "created_at")
SELECT d.workspace_id, d.id, d.company_id, COALESCE(a.kind, 'sistema'), a.channel, a.content, 'sistema',
       COALESCE(a.created_at, now()), a.id, COALESCE(a.created_at, now())
FROM "activities" a
JOIN "crm_deals" d ON d.legacy_lead_id = a.lead_id
ON CONFLICT ("legacy_activity_id") DO NOTHING;
