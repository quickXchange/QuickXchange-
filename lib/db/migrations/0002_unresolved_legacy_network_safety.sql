UPDATE "exchange_orders"
SET
	"status" = 'verification required',
	"outcome_unknown" = true,
	"error_code" = 'LEGACY_NETWORK_MISSING',
	"error_message" = 'Network details require operator verification before funds should be sent.'
WHERE
	"provider" = 'Quickex'
	AND "provider_order_id" = ''
	AND ("from_network" = '' OR "to_network" = '')
	AND NOT (LOWER("status") ~ '(complete|paid|refund|expire|fail|cancel)');