import pg from "pg";
import { ensureOrderDirectoryIndexes } from "./online-order-directory-indexes.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must identify the database approved for this one-off operation.");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const verified = await ensureOrderDirectoryIndexes(pool);
  process.stdout.write(`${JSON.stringify({ verified }, null, 2)}\n`);
} finally {
  await pool.end();
}