CREATE TABLE "search_results" (
	"search_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	CONSTRAINT "search_results_search_id_place_id_pk" PRIMARY KEY("search_id","place_id")
);
--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "status" text DEFAULT 'done';--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "site_audits" ADD COLUMN "approachable" boolean;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_place_id_unique" UNIQUE("place_id");