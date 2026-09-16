const INDEX_SPECS = [
  {
    name: "exchange_orders_created_at_id_idx",
    columns: ["created_at", "id"],
  },
  {
    name: "exchange_orders_status_created_at_id_idx",
    columns: ["status", "created_at", "id"],
  },
  {
    name: "exchange_orders_customer_created_at_id_idx",
    columns: ["customer_clerk_user_id", "created_at", "id"],
  },
];

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(identifier) {
  if (!IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function inspectIndex(client, schema, indexName) {
  const result = await client.query(
    `SELECT
       index_class.relname AS index_name,
       index_meta.indisready AS ready,
       index_meta.indisvalid AS valid,
       index_meta.indisunique AS unique_index,
       index_meta.indpred IS NOT NULL AS partial_index,
       index_meta.indnkeyatts AS key_count,
       index_meta.indnatts AS total_attribute_count,
       access_method.amname AS access_method,
       array_agg(attribute.attname::text ORDER BY key_column.ordinality)::text[] AS columns,
       bool_and(index_meta.indoption[key_column.ordinality - 1] = 0) AS default_ordering,
       bool_and(
         index_meta.indcollation[key_column.ordinality - 1] = attribute.attcollation
       ) AS matching_collations,
       bool_and(
         operator_class.opcdefault
         AND operator_class.opcmethod = index_class.relam
       ) AS default_operator_classes
     FROM pg_index AS index_meta
     JOIN pg_class AS table_class ON table_class.oid = index_meta.indrelid
     JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
     JOIN pg_class AS index_class ON index_class.oid = index_meta.indexrelid
     JOIN pg_am AS access_method ON access_method.oid = index_class.relam
     CROSS JOIN LATERAL unnest(index_meta.indkey)
       WITH ORDINALITY AS key_column(attribute_number, ordinality)
     JOIN pg_attribute AS attribute
       ON attribute.attrelid = table_class.oid
      AND attribute.attnum = key_column.attribute_number
     JOIN pg_opclass AS operator_class
       ON operator_class.oid = index_meta.indclass[key_column.ordinality - 1]
     WHERE table_namespace.nspname = $1
       AND table_class.relname = 'exchange_orders'
       AND index_class.relname = $2
     GROUP BY
       index_class.relname,
       index_meta.indisready,
       index_meta.indisvalid,
       index_meta.indisunique,
       index_meta.indpred,
       index_meta.indnkeyatts,
       index_meta.indnatts,
       access_method.amname`,
    [schema, indexName],
  );
  return result.rows[0];
}

function hasExpectedDefinition(index, expectedColumns) {
  return (
    index?.access_method === "btree" &&
    index.unique_index === false &&
    index.partial_index === false &&
    index.key_count === expectedColumns.length &&
    index.total_attribute_count === expectedColumns.length &&
    index.default_ordering === true &&
    index.matching_collations === true &&
    index.default_operator_classes === true &&
    Array.isArray(index.columns) &&
    index.columns.length === expectedColumns.length &&
    index.columns.every((column, position) => column === expectedColumns[position])
  );
}

export async function ensureOrderDirectoryIndexes(
  connection,
  {
    schema = "public",
    lockTimeoutMs = 5_000,
    statementTimeoutMs = 15 * 60_000,
  } = {},
) {
  quoteIdentifier(schema);
  if (!Number.isInteger(lockTimeoutMs) || lockTimeoutMs < 1) {
    throw new Error("lockTimeoutMs must be a positive integer.");
  }
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1) {
    throw new Error("statementTimeoutMs must be a positive integer.");
  }

  const ownsClient = typeof connection.release !== "function";
  const client = ownsClient ? await connection.connect() : connection;
  try {
    const table = await client.query(
      `SELECT 1
       FROM pg_class AS table_class
       JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_class.relnamespace
       WHERE table_namespace.nspname = $1
         AND table_class.relname = 'exchange_orders'
         AND table_class.relkind = 'r'`,
      [schema],
    );
    if (table.rowCount !== 1) {
      throw new Error(`Table ${schema}.exchange_orders does not exist.`);
    }

    await client.query(`SET lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query(`SET statement_timeout = '${statementTimeoutMs}ms'`);

    const quotedSchema = quoteIdentifier(schema);
    for (const specification of INDEX_SPECS) {
      const existing = await inspectIndex(client, schema, specification.name);
      if (existing && !hasExpectedDefinition(existing, specification.columns)) {
        throw new Error(
          `Index ${schema}.${specification.name} exists with an unexpected definition.`,
        );
      }
      if (existing && (!existing.ready || !existing.valid)) {
        await client.query(
          `DROP INDEX CONCURRENTLY ${quotedSchema}.${quoteIdentifier(specification.name)}`,
        );
      }
      if (!existing || !existing.ready || !existing.valid) {
        await client.query(
          `CREATE INDEX CONCURRENTLY ${quoteIdentifier(specification.name)}
           ON ${quotedSchema}."exchange_orders"
           USING btree (${specification.columns.map(quoteIdentifier).join(", ")})`,
        );
      }
    }

    const verified = [];
    for (const specification of INDEX_SPECS) {
      const index = await inspectIndex(client, schema, specification.name);
      if (
        !hasExpectedDefinition(index, specification.columns) ||
        index.ready !== true ||
        index.valid !== true
      ) {
        throw new Error(`Index ${schema}.${specification.name} failed verification.`);
      }
      verified.push({
        indexName: specification.name,
        columns: index.columns,
        ready: index.ready,
        valid: index.valid,
      });
    }
    return verified;
  } finally {
    try {
      await client.query("RESET lock_timeout");
      await client.query("RESET statement_timeout");
    } finally {
      if (ownsClient) client.release();
    }
  }
}