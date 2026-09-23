export function createRuntimeDatabaseConnectionConfig(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  const useDatabaseOwner = env.USE_DATABASE_OWNER === "true";
  const runtimeDatabaseUrl = new URL(env.DATABASE_URL);

  if (!useDatabaseOwner) {
    if (!env.APP_DATABASE_PASSWORD) {
      throw new Error(
        "APP_DATABASE_PASSWORD must be set for the restricted database role.",
      );
    }
    runtimeDatabaseUrl.username = "quickex_app_runtime";
    runtimeDatabaseUrl.password = env.APP_DATABASE_PASSWORD;
  }

  return {
    connectionString: runtimeDatabaseUrl.toString(),
    connectionTimeoutMillis: 5_000,
  };
}