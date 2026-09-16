import {
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fiatCurrenciesTable } from "./fiat-currencies";

export type PaymentMethodFieldDefinition = {
  key: string;
  type:
    | "short-text"
    | "long-text"
    | "integer"
    | "numeric"
    | "decimal"
    | "account-iban"
    | "account-number"
    | "account-name"
    | "bank-code"
    | "routing-number"
    | "country-code"
    | "postal-address"
    | "phone"
    | "email"
    | "date"
    | "select"
    | "wallet-address"
    | "memo-tag"
    | "private-image"
    // Retained so previously stored field definitions remain readable.
    | "text"
    | "number"
    | "textarea";
  label: string;
  direction?: "send" | "receive" | "both";
  emphasizedLabel?: boolean;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  requiredWhen?: {
    fieldKey: string;
    equals: string | string[];
  };
};

export const paymentMethodsTable = pgTable("payment_methods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoObjectPath: text("logo_object_path"),
  description: text("description"),
  instructions: text("instructions"),
  family: text("family").notNull().default("bank-transfer"),
  executionMode: text("execution_mode").notNull().default("manual"),
  providerId: text("provider_id"),
  lifecycle: text("lifecycle").notNull().default("active"),
  regions: jsonb("regions").$type<string[]>().notNull().default([]),
  countries: jsonb("countries").$type<string[]>().notNull().default([]),
  requiresProviderConfiguration: boolean("requires_provider_configuration")
    .notNull()
    .default(false),
  enabled: boolean("enabled").notNull().default(true),
  canSend: boolean("can_send").notNull().default(true),
  canReceive: boolean("can_receive").notNull().default(true),
  fieldDefinitions: jsonb("field_definitions")
    .$type<PaymentMethodFieldDefinition[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const fiatCurrencyPaymentMethodsTable = pgTable(
  "fiat_currency_payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fiatCurrencyId: uuid("fiat_currency_id")
      .notNull()
      .references(() => fiatCurrenciesTable.id, { onDelete: "cascade" }),
    paymentMethodId: text("payment_method_id")
      .notNull()
      .references(() => paymentMethodsTable.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    canSend: boolean("can_send"),
    canReceive: boolean("can_receive"),
    sendInstructions: text("send_instructions"),
    receiveInstructions: text("receive_instructions"),
    minAmount: numeric("min_amount", { precision: 38, scale: 18 }),
    maxAmount: numeric("max_amount", { precision: 38, scale: 18 }),
    countries: jsonb("countries").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("fiat_currency_payment_methods_currency_method_uidx").on(
      table.fiatCurrencyId,
      table.paymentMethodId,
    ),
  ],
);

export const insertPaymentMethodSchema = createInsertSchema(paymentMethodsTable)
  .omit({ createdAt: true, updatedAt: true });
export const insertFiatCurrencyPaymentMethodSchema =
  createInsertSchema(fiatCurrencyPaymentMethodsTable)
    .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type InsertFiatCurrencyPaymentMethod =
  z.infer<typeof insertFiatCurrencyPaymentMethodSchema>;
export type FiatCurrencyPaymentMethod =
  typeof fiatCurrencyPaymentMethodsTable.$inferSelect;