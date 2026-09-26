ALTER TABLE "exchange_orders"
  ADD COLUMN "customer_id" text;

ALTER TABLE "exchange_orders"
  ADD CONSTRAINT "exchange_orders_customer_id_exchange_customers_id_fk"
  FOREIGN KEY ("customer_id") REFERENCES "exchange_customers"("id")
  ON DELETE SET NULL NOT VALID;

-- Only use the strong Clerk identity key where a profile explicitly maps it.
UPDATE "exchange_orders" AS order_row
SET "customer_id" = profile."customer_id"
FROM "customer_profiles" AS profile
WHERE order_row."customer_id" IS NULL
  AND order_row."customer_clerk_user_id" IS NOT NULL
  AND profile."clerk_user_id" = order_row."customer_clerk_user_id";

-- Legacy guest orders may be linked by exact email only. exchange_customers.email
-- is unique; signed-in/claimed orders are deliberately excluded from this fallback.
UPDATE "exchange_orders" AS order_row
SET "customer_id" = customer."id"
FROM "exchange_customers" AS customer
WHERE order_row."customer_id" IS NULL
  AND order_row."customer_clerk_user_id" IS NULL
  AND order_row."customer_email" = customer."email";

ALTER TABLE "exchange_orders"
  VALIDATE CONSTRAINT "exchange_orders_customer_id_exchange_customers_id_fk";