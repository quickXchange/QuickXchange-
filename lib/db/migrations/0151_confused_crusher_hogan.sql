CREATE TABLE "admin_inbox_receipts" (
	"notification_id" uuid NOT NULL,
	"operator_id" text NOT NULL,
	"read_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "admin_inbox_receipts_notification_id_operator_id_pk" PRIMARY KEY("notification_id","operator_id")
);
--> statement-breakpoint
CREATE TABLE "admin_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_inbox_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
ALTER TABLE "admin_inbox_receipts" ADD CONSTRAINT "admin_inbox_receipts_notification_id_admin_inbox_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."admin_inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_inbox_operator_idx" ON "admin_inbox_receipts" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "admin_inbox_created_idx" ON "admin_inbox" USING btree ("created_at","id");