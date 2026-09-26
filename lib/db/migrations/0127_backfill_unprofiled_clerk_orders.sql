WITH order_identities AS (
  SELECT customer_email, customer_clerk_user_id AS clerk_user_id
  FROM exchange_orders
  WHERE customer_clerk_user_id IS NOT NULL

  UNION

  SELECT customer.email, profile.clerk_user_id
  FROM customer_profiles AS profile
  JOIN exchange_customers AS customer ON customer.id = profile.customer_id
  WHERE profile.clerk_user_id IS NOT NULL
),
unique_email_identities AS (
  SELECT customer_email, min(clerk_user_id) AS clerk_user_id
  FROM order_identities
  GROUP BY customer_email
  HAVING count(*) = 1
)
UPDATE exchange_orders AS order_row
SET customer_id = customer.id
FROM exchange_customers AS customer
JOIN unique_email_identities AS identity
  ON identity.customer_email = customer.email
WHERE order_row.customer_id IS NULL
  AND order_row.customer_clerk_user_id IS NOT NULL
  AND order_row.customer_email = customer.email
  AND order_row.customer_clerk_user_id = identity.clerk_user_id
  -- A Clerk identity already attached to another customer must never be moved
  -- onto the customer found through an email match.
  AND NOT EXISTS (
    SELECT 1
    FROM customer_profiles AS linked_profile
    WHERE linked_profile.clerk_user_id = order_row.customer_clerk_user_id
      AND linked_profile.customer_id <> customer.id
  );