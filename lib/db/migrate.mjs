import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set before running database migrations.");
}
if (!process.env.APP_DATABASE_PASSWORD) {
  throw new Error(
    "APP_DATABASE_PASSWORD must be set before provisioning the runtime database role.",
  );
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
  });
  const passwordStatement = await pool.query(
    "SELECT format('ALTER ROLE quickex_app_runtime PASSWORD %L', $1::text) AS sql",
    [process.env.APP_DATABASE_PASSWORD],
  );
  await pool.query(passwordStatement.rows[0].sql);
} finally {
  await pool.end();
}