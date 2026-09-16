import pg from "pg";

export function createPrivilegedTestPool() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Privileged test database access is disabled in production.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set for privileged database tests.");
  }
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}