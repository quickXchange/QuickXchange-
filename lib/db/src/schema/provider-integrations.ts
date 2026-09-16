import {
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const providerIntegrationsTable = pgTable("provider_integrations", {
  provider: text("provider").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  initializationVector: text("initialization_vector").notNull(),
  authenticationTag: text("authentication_tag").notNull(),
  encryptionVersion: integer("encryption_version").notNull().default(1),
  createdByOperatorId: text("created_by_operator_id"),
  updatedByOperatorId: text("updated_by_operator_id"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }).notNull(),
  verificationVersion: integer("verification_version"),
  verifiedCredentialFingerprint: text("verified_credential_fingerprint"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProviderIntegrationSchema = createInsertSchema(
  providerIntegrationsTable,
);
export type ProviderIntegration =
  typeof providerIntegrationsTable.$inferSelect;