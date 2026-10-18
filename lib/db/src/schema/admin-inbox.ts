import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

/** Shared immutable events; read/dismiss state belongs to each operator. */
export const adminInboxTable = pgTable("admin_inbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventKey: text("event_key").notNull().unique(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  orderId: text("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("admin_inbox_created_idx").on(t.createdAt, t.id)]);

export const adminInboxReceiptsTable = pgTable("admin_inbox_receipts", {
  notificationId: uuid("notification_id").notNull().references(() => adminInboxTable.id, { onDelete: "cascade" }),
  operatorId: text("operator_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, t => [primaryKey({ columns: [t.notificationId, t.operatorId] }), index("admin_inbox_operator_idx").on(t.operatorId)]);

export const insertAdminInboxSchema = createInsertSchema(adminInboxTable).omit({ id: true, createdAt: true });
export type AdminInboxEvent = typeof adminInboxTable.$inferSelect;
