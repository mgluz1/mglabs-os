CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"kind" text,
	"channel" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"month" text NOT NULL,
	"endpoint" text NOT NULL,
	"calls" integer DEFAULT 0,
	CONSTRAINT "api_usage_month_endpoint_pk" PRIMARY KEY("month","endpoint")
);
--> statement-breakpoint
CREATE TABLE "lead_scores" (
	"place_id" uuid PRIMARY KEY NOT NULL,
	"total" integer,
	"block_a" integer,
	"block_b" integer,
	"block_c" integer,
	"block_d" integer,
	"rules" jsonb,
	"weights_version" text,
	"scored_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid,
	"stage" text DEFAULT 'novo',
	"offer" text,
	"expected_value" numeric,
	"next_step" text,
	"next_step_at" timestamp with time zone,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "leads_place_id_unique" UNIQUE("place_id")
);
--> statement-breakpoint
CREATE TABLE "optouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"google_place_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "place_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid,
	"kind" text,
	"value" text,
	"source" text,
	"confirmed" boolean DEFAULT false,
	"collected_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "place_contacts_place_kind_value_uq" UNIQUE("place_id","kind","value")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_place_id" text NOT NULL,
	"name" text,
	"primary_type" text,
	"category" text,
	"address" text,
	"neighborhood" text,
	"city" text,
	"geom" geography(Point, 4326),
	"rating" numeric,
	"rating_count" integer,
	"business_status" text,
	"google_phone" text,
	"google_website" text,
	"google_maps_uri" text,
	"google_cached_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "places_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text,
	"center" geography(Point, 4326),
	"radius_m" integer,
	"api_calls" integer,
	"results" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid,
	"url" text,
	"site_type" text,
	"https" boolean,
	"viewport" boolean,
	"psi_performance" integer,
	"psi_seo" integer,
	"has_services_page" boolean,
	"has_booking" boolean,
	"has_whatsapp_button" boolean,
	"signals" jsonb,
	"status" text DEFAULT 'pending',
	"error" text,
	"audited_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_contacts" ADD CONSTRAINT "place_contacts_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "places_geom_idx" ON "places" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "places_name_trgm_idx" ON "places" USING gin ("name" gin_trgm_ops);