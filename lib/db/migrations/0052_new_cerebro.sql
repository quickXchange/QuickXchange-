DROP INDEX "site_nav_links_placement_order_idx";--> statement-breakpoint
ALTER TABLE "site_nav_links" ADD COLUMN "widget" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "site_nav_links_placement_order_idx" ON "site_nav_links" USING btree ("header","footer","widget","sort_order");