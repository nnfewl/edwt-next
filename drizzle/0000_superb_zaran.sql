CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"type" text,
	"status" text,
	"address" text,
	"website" text,
	"phone" text,
	"description" text,
	"audience" text,
	"latitude" double precision,
	"longitude" double precision,
	"open247" boolean,
	"show_wait_times" boolean,
	"show_status" boolean,
	"wait_time_fallback" text,
	"operating_hours" jsonb,
	"alert" jsonb,
	"metadata" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_polls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_polls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"http_status" integer NOT NULL,
	"etag" text,
	"location_count" integer,
	"duration_ms" integer,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wait_time_readings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wait_time_readings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"location_id" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"report_id" text,
	"reading_id" text,
	"reading_created_at" timestamp with time zone,
	"wait_time_minutes" integer,
	"elos_minutes" integer,
	"status" text,
	"has_wait_time" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wait_time_readings" ADD CONSTRAINT "wait_time_readings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_readings_location_observed" ON "wait_time_readings" USING btree ("location_id","observed_at");--> statement-breakpoint
CREATE INDEX "idx_readings_observed" ON "wait_time_readings" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_readings_location_report" ON "wait_time_readings" USING btree ("location_id","report_id");