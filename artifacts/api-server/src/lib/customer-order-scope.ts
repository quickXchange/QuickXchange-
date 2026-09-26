import { eq } from "drizzle-orm";
import { ordersTable } from "@workspace/db";

export function customerOrderScope(customerId: string) {
  return eq(ordersTable.customerId, customerId);
}