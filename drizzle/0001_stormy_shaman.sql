CREATE TABLE "wait_time_hourly" (
	"location_id" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"sample_count" integer NOT NULL,
	"reported_count" integer NOT NULL,
	"avg_wait_minutes" double precision,
	"min_wait_minutes" integer,
	"max_wait_minutes" integer,
	"avg_elos_minutes" double precision,
	"min_elos_minutes" integer,
	"max_elos_minutes" integer,
	CONSTRAINT "wait_time_hourly_location_id_bucket_pk" PRIMARY KEY("location_id","bucket")
);
--> statement-breakpoint
ALTER TABLE "wait_time_hourly" ADD CONSTRAINT "wait_time_hourly_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hourly_bucket" ON "wait_time_hourly" USING btree ("bucket");