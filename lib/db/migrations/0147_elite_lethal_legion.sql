CREATE TABLE "deposit_provider_switch_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"request_digest" text NOT NULL,
	"deposit_provider" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_provider_switch_routes" (
	"job_id" text NOT NULL,
	"network_id" text NOT NULL,
	"original_customer_deposits_enabled" boolean NOT NULL,
	"source_digest" text NOT NULL,
	"mapping" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text DEFAULT 'pending' NOT NULL,
	"message" text DEFAULT 'Waiting to start' NOT NULL,
	"error_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_token" text,
	"lease_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_provider_switch_routes_job_id_network_id_pk" PRIMARY KEY("job_id","network_id")
);
--> statement-breakpoint
ALTER TABLE "deposit_provider_switch_routes" ADD CONSTRAINT "deposit_provider_switch_routes_job_id_deposit_provider_switch_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."deposit_provider_switch_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_provider_switch_active_route" ON "deposit_provider_switch_routes" USING btree ("network_id") WHERE "deposit_provider_switch_routes"."status" in ('queued', 'running');