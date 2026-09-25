export function assertIsolatedWhitebitDatabase() {
  const name = process.env.WHITEBIT_ISOLATED_DATABASE;
  let databaseName: string | undefined;
  try {
    databaseName = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  } catch {
    // A missing or malformed connection is never an isolated test database.
  }
  if (!name || !/^whitebit_test_[0-9a-f]{16}$/.test(name) || databaseName !== name) {
    throw new Error("WhiteBIT integration tests require the disposable database created by test:whitebit.");
  }
}