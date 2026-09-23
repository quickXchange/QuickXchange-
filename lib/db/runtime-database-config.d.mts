export interface RuntimeDatabaseEnvironment {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  USE_DATABASE_OWNER?: string;
  APP_DATABASE_PASSWORD?: string;
}

export interface RuntimeDatabaseConnectionConfig {
  connectionString: string;
  connectionTimeoutMillis: number;
}

export function createRuntimeDatabaseConnectionConfig(
  env?: RuntimeDatabaseEnvironment,
): RuntimeDatabaseConnectionConfig;