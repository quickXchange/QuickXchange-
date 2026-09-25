import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db,
  operatorAuditLogsTable,
  providerIntegrationsTable,
} from "@workspace/db";

const QUICKEX_PROVIDER = "quickex";
const WHITEBIT_PROVIDER = "whitebit";
const ENCRYPTION_VERSION = 1;
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_SALT = "rook-provider-credentials";
const KEY_CONTEXT = "quickex-credentials-v1";
export const QUICKEX_VERIFICATION_VERSION = 1;

export type QuickexCredentials = {
  publicKey: string;
  secretKey: string;
};

export type WhitebitCredentials = {
  apiKey: string;
  secretKey: string;
};

export type WhitebitCredentialSource = "stored" | "environment";

export function whitebitCredentialSourceConfiguration(): {
  explicit: boolean;
  valid: boolean;
  source: WhitebitCredentialSource | null;
} {
  const configured = process.env.WHITEBIT_CREDENTIAL_SOURCE;
  if (configured === undefined) return { explicit: false, valid: true, source: null };
  if (configured === "stored" || configured === "environment") {
    return { explicit: true, valid: true, source: configured };
  }
  return { explicit: true, valid: false, source: null };
}

/** Switching trading accounts must not silently replay old account history. */
export function whitebitHistoricalReconciliationAllowed(): boolean {
  const selected = whitebitCredentialSourceConfiguration();
  return selected.valid &&
    (selected.source !== "environment" ||
      process.env.WHITEBIT_HISTORICAL_RECONCILIATION_APPROVED === "true");
}

export type StoredQuickexCredentials = {
  credentials: QuickexCredentials;
  updatedAt: Date;
  verificationVersion: number | null;
  verifiedCredentialFingerprint: string | null;
  verifiedAt: Date | null;
  lastTestedAt: Date;
};

export type QuickexCredentialStorageState =
  | { status: "absent" }
  | {
      status: "available";
      credentials: QuickexCredentials;
      updatedAt: Date;
      verificationVersion: number | null;
      verifiedCredentialFingerprint: string | null;
      verifiedAt: Date | null;
      lastTestedAt: Date;
    }
  | {
      status: "unavailable";
      updatedAt: Date;
    };

export type QuickexCredentialAudit = {
  actorClerkUserId: string | null;
  operatorId: string | null;
  operatorEmail: string | null;
  requestId: string | null;
  action?: string;
  credentialSource?: "stored" | "environment";
};

export type QuickexCredentialVerification = {
  version: typeof QUICKEX_VERIFICATION_VERSION;
  fingerprint: string;
  verifiedAt: Date;
};

export class ProviderCredentialStateChangedError extends Error {
  constructor() {
    super("Provider credentials changed while remote verification was in progress.");
    this.name = "ProviderCredentialStateChangedError";
  }
}

type ProviderCredentialTestAdapter = {
  getQuickexCredentials: () =>
    | StoredQuickexCredentials
    | null
    | Promise<StoredQuickexCredentials | null>;
  activateQuickexCredentials: (
    credentials: QuickexCredentials,
    audit: QuickexCredentialAudit,
    verification: QuickexCredentialVerification,
  ) => StoredQuickexCredentials | Promise<StoredQuickexCredentials>;
};

let testAdapter: ProviderCredentialTestAdapter | undefined;

export function configureProviderCredentialStoreForTests(
  adapter: ProviderCredentialTestAdapter,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Provider credential test adapters require NODE_ENV=test.");
  }
  testAdapter = adapter;
}

function encryptionKey(): Buffer {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (!sessionSecret) {
    throw new Error("Provider credential encryption is unavailable.");
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(sessionSecret, "utf8"),
      Buffer.from(KEY_SALT, "utf8"),
      Buffer.from(KEY_CONTEXT, "utf8"),
      32,
    ),
  );
}

export function quickexCredentialFingerprint(
  credentials: QuickexCredentials,
): string {
  return createHmac("sha256", encryptionKey())
    .update("quickex-credential-verification\0")
    .update(credentials.publicKey)
    .update("\0")
    .update(credentials.secretKey)
    .digest("base64url");
}

export function whitebitCredentialFingerprint(
  credentials: WhitebitCredentials,
): string {
  return createHmac("sha256", encryptionKey())
    .update("whitebit-route-verification\0")
    .update(credentials.apiKey)
    .update("\0")
    .update(credentials.secretKey)
    .digest("base64url");
}

function additionalAuthenticatedData(provider: string): Buffer {
  return Buffer.from(
    `rook:${provider}:v${ENCRYPTION_VERSION}`,
    "utf8",
  );
}

function encryptProviderCredentials(
  provider: string,
  credentials: QuickexCredentials,
): {
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  encryptionVersion: number;
} {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    encryptionKey(),
    initializationVector,
  );
  cipher.setAAD(additionalAuthenticatedData(provider));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    encryptionVersion: ENCRYPTION_VERSION,
  };
}

function decryptProviderCredentials(
  provider: string,
  input: {
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  encryptionVersion: number;
  },
): QuickexCredentials {
  if (input.encryptionVersion !== ENCRYPTION_VERSION) {
    throw new Error("Provider credential encryption version is unsupported.");
  }
  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    encryptionKey(),
    Buffer.from(input.initializationVector, "base64"),
  );
  decipher.setAAD(additionalAuthenticatedData(provider));
  decipher.setAuthTag(Buffer.from(input.authenticationTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<QuickexCredentials>;
  if (
    typeof parsed.publicKey !== "string" ||
    !parsed.publicKey ||
    typeof parsed.secretKey !== "string" ||
    !parsed.secretKey
  ) {
    throw new Error("Stored provider credentials are invalid.");
  }
  return {
    publicKey: parsed.publicKey,
    secretKey: parsed.secretKey,
  };
}

export function encryptQuickexCredentials(credentials: QuickexCredentials) {
  return encryptProviderCredentials(QUICKEX_PROVIDER, credentials);
}

export function decryptQuickexCredentials(input: {
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  encryptionVersion: number;
}): QuickexCredentials {
  return decryptProviderCredentials(QUICKEX_PROVIDER, input);
}

export async function getQuickexCredentialStorageState():
Promise<QuickexCredentialStorageState> {
  if (testAdapter) {
    const stored = await testAdapter.getQuickexCredentials();
    return stored
      ? {
          status: "available",
          credentials: stored.credentials,
          updatedAt: stored.updatedAt,
          verificationVersion: stored.verificationVersion,
          verifiedCredentialFingerprint: stored.verifiedCredentialFingerprint,
          verifiedAt: stored.verifiedAt,
          lastTestedAt: stored.lastTestedAt,
        }
      : { status: "absent" };
  }
  const [row] = await db
    .select()
    .from(providerIntegrationsTable)
    .where(eq(providerIntegrationsTable.provider, QUICKEX_PROVIDER))
    .limit(1);
  if (!row) return { status: "absent" };
  try {
    return {
      status: "available",
      credentials: decryptQuickexCredentials(row),
      updatedAt: row.updatedAt,
      verificationVersion: row.verificationVersion,
      verifiedCredentialFingerprint: row.verifiedCredentialFingerprint,
      verifiedAt: row.verifiedAt,
      lastTestedAt: row.lastTestedAt,
    };
  } catch {
    return {
      status: "unavailable",
      updatedAt: row.updatedAt,
    };
  }
}

export async function getWhitebitCredentialStorageState(
  executor: { select: (...args: any[]) => any } = db,
) {
  const [row] = await executor.select().from(providerIntegrationsTable)
    .where(eq(providerIntegrationsTable.provider, WHITEBIT_PROVIDER)).limit(1);
  if (!row) return { status: "absent" as const };
  try {
    const stored = decryptProviderCredentials(WHITEBIT_PROVIDER, row);
    return {
      status: "available" as const,
      credentials: { apiKey: stored.publicKey, secretKey: stored.secretKey },
      updatedAt: row.updatedAt,
      lastTestedAt: row.lastTestedAt,
    };
  } catch {
    return { status: "unavailable" as const, updatedAt: row.updatedAt };
  }
}

/**
 * Resolve the one credential identity used by WhiteBIT operational calls.
 * An explicitly selected source never falls back. When unset, retain legacy
 * stored-first selection with environment fallback.
 */
export async function getSelectedWhitebitCredentialState(
  executor: { select: (...args: any[]) => any } = db,
) {
  const configuration = whitebitCredentialSourceConfiguration();
  if (!configuration.valid) return { status: "unavailable" as const, source: null };
  const stored = configuration.source === "environment"
    ? null
    : await getWhitebitCredentialStorageState(executor);
  const environment = process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
    ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET }
    : null;
  if (configuration.source === "environment") {
    return environment
      ? { status: "available" as const, source: "environment" as const, credentials: environment }
      : { status: "absent" as const, source: null };
  }
  if (configuration.source === "stored") {
    return stored?.status === "available"
      ? { ...stored, source: "stored" as const }
      : stored?.status === "unavailable"
        ? { ...stored, source: null }
        : { status: "absent" as const, source: null };
  }
  if (stored?.status === "available") return { ...stored, source: "stored" as const };
  if (environment) return { status: "available" as const, source: "environment" as const, credentials: environment };
  if (stored?.status === "unavailable") return { ...stored, source: null };
  return { status: "absent" as const, source: null };
}

/** Resolve a source-specific operational consumer while respecting the global
 * selector whenever it is explicitly configured. */
export async function getWhitebitCredentialStateForSource(
  source: WhitebitCredentialSource,
  executor: { select: (...args: any[]) => any } = db,
) {
  const configuration = whitebitCredentialSourceConfiguration();
  if (!configuration.valid || (configuration.explicit && configuration.source !== source)) {
    return { status: "unavailable" as const, source: null };
  }
  if (source === "environment") {
    const credentials = process.env.WHITEBIT_API_KEY && process.env.WHITEBIT_API_SECRET
      ? { apiKey: process.env.WHITEBIT_API_KEY, secretKey: process.env.WHITEBIT_API_SECRET }
      : null;
    return credentials
      ? { status: "available" as const, source, credentials }
      : { status: "absent" as const, source: null };
  }
  const stored = await getWhitebitCredentialStorageState(executor);
  return stored.status === "available"
    ? { ...stored, source: "stored" as const }
    : stored.status === "unavailable"
      ? { ...stored, source: null }
      : { status: "absent" as const, source: null };
}

export async function activateWhitebitCredentials(
  credentials: WhitebitCredentials,
  audit: QuickexCredentialAudit,
  options?: {
    afterActivate?: (tx: any) => Promise<void>;
  },
) {
  return activateProviderCredentials(
    WHITEBIT_PROVIDER,
    { publicKey: credentials.apiKey, secretKey: credentials.secretKey },
    audit,
    undefined,
    undefined,
    options?.afterActivate,
  );
}

export async function activateQuickexCredentials(
  credentials: QuickexCredentials,
  audit: QuickexCredentialAudit,
  verification: QuickexCredentialVerification,
  options?: { expectedUpdatedAt?: Date | null },
): Promise<StoredQuickexCredentials> {
  if (
    verification.version !== QUICKEX_VERIFICATION_VERSION ||
    verification.fingerprint !== quickexCredentialFingerprint(credentials)
  ) {
    throw new Error("Quickex credential verification does not match the submitted credentials.");
  }
  if (testAdapter) {
    return testAdapter.activateQuickexCredentials(credentials, audit, verification);
  }
  return activateProviderCredentials(
    QUICKEX_PROVIDER,
    credentials,
    audit,
    verification,
    options,
  );
}

async function activateProviderCredentials(
  provider: string,
  credentials: QuickexCredentials,
  audit: QuickexCredentialAudit,
  verification?: QuickexCredentialVerification,
  options?: { expectedUpdatedAt?: Date | null },
  afterActivate?: (tx: any) => Promise<void>,
): Promise<StoredQuickexCredentials> {
  const encrypted = encryptProviderCredentials(provider, credentials);
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`rook:${provider}:credentials`}, 0))`,
    );
    const [existing] = await tx
      .select({
        provider: providerIntegrationsTable.provider,
        updatedAt: providerIntegrationsTable.updatedAt,
      })
      .from(providerIntegrationsTable)
      .where(eq(providerIntegrationsTable.provider, provider))
      .limit(1);
    if (options && Object.hasOwn(options, "expectedUpdatedAt")) {
      const expected = options.expectedUpdatedAt;
      const unchanged = expected === null
        ? !existing
        : Boolean(existing && expected &&
            existing.updatedAt.getTime() === expected.getTime());
      if (!unchanged) throw new ProviderCredentialStateChangedError();
    }
    const [row] = await tx
      .insert(providerIntegrationsTable)
      .values({
        provider,
        ...encrypted,
        createdByOperatorId: audit.operatorId,
        updatedByOperatorId: audit.operatorId,
        lastTestedAt: now,
        verificationVersion: verification?.version ?? null,
        verifiedCredentialFingerprint: verification?.fingerprint ?? null,
        verifiedAt: verification?.verifiedAt ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: providerIntegrationsTable.provider,
        set: {
          ...encrypted,
          updatedByOperatorId: audit.operatorId,
          lastTestedAt: now,
          verificationVersion: verification?.version ?? null,
          verifiedCredentialFingerprint: verification?.fingerprint ?? null,
          verifiedAt: verification?.verifiedAt ?? null,
          updatedAt: now,
        },
      })
      .returning();
    await tx.insert(operatorAuditLogsTable).values({
      action: audit.action ?? (existing
        ? `provider.${provider}_credentials_rotated`
        : `provider.${provider}_connected`),
      actorClerkUserId: audit.actorClerkUserId,
      targetOperatorId: audit.operatorId,
      targetEmail: audit.operatorEmail,
      requestId: audit.requestId,
      details: {
        provider,
        credentialSource: audit.credentialSource ?? "stored",
      },
    });
    await afterActivate?.(tx);
    return {
      credentials,
      updatedAt: row.updatedAt,
      verificationVersion: row.verificationVersion,
      verifiedCredentialFingerprint: row.verifiedCredentialFingerprint,
      verifiedAt: row.verifiedAt,
      lastTestedAt: row.lastTestedAt,
    };
  });
}

export function activateProviderCredentialsForTests(
  provider: string,
  credentials: QuickexCredentials,
  audit: QuickexCredentialAudit,
): Promise<StoredQuickexCredentials> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Provider credential test helpers require NODE_ENV=test.");
  }
  return activateProviderCredentials(provider, credentials, audit);
}