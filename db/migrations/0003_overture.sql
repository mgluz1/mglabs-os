CREATE TABLE "ov_places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"basic_category" text,
	"taxonomy_primary" text,
	"hierarchy" text[],
	"alternates" text[],
	"brand" text,
	"confidence" numeric,
	"operating_status" text,
	"websites" text[],
	"socials" text[],
	"emails" text[],
	"phones" text[],
	"address" text,
	"locality" text,
	"postcode" text,
	"source_count" integer,
	"geom" geography(Point, 4326),
	"release" text,
	"loaded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "places" ALTER COLUMN "google_place_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "source" text DEFAULT 'google';--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "overture_id" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "confidence" numeric;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "source_count" integer;--> statement-breakpoint
CREATE INDEX "ov_places_geom_idx" ON "ov_places" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "ov_places_basic_idx" ON "ov_places" USING btree ("basic_category");--> statement-breakpoint
CREATE INDEX "ov_places_primary_idx" ON "ov_places" USING btree ("taxonomy_primary");--> statement-breakpoint
CREATE INDEX "ov_places_hierarchy_idx" ON "ov_places" USING gin ("hierarchy");--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_overture_id_unique" UNIQUE("overture_id");