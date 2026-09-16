import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { ApiError } from "./api-error";
import { customerProfilesTable, customersTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

type CustomerAuthorizationTestAdapter = {
  getUserId: (req: Request) => string | null;
  getVerifiedEmail?: (userId: string) => string | null | Promise<string | null>;
};

let testAdapter: CustomerAuthorizationTestAdapter | undefined;
export function customerStatusAllowsApi(status: string | undefined): boolean {
  return status !== "suspended";
}

type CustomerEmailSelection = {
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification?: { status?: string | null } | null;
  }>;
};

export function configureCustomerAuthorizationForTests(
  adapter: CustomerAuthorizationTestAdapter,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Customer authorization test adapters require NODE_ENV=test.");
  }
  testAdapter = adapter;
}

export function getCustomerActorUserId(req: Request): string | null {
  return process.env.NODE_ENV === "test" && testAdapter
    ? testAdapter.getUserId(req)
    : getAuth(req).userId;
}

export function selectCustomerVerifiedEmail(
  user: CustomerEmailSelection,
): string | null {
  const email =
    user.emailAddresses.find(
      (candidate) =>
        candidate.id === user.primaryEmailAddressId &&
        candidate.verification?.status === "verified",
    ) ??
    user.emailAddresses.find(
      (candidate) => candidate.verification?.status === "verified",
    );
  return email ? email.emailAddress.trim().toLowerCase() : null;
}

export async function getCustomerVerifiedEmail(
  userId: string,
): Promise<string | null> {
  if (process.env.NODE_ENV === "test" && testAdapter) {
    const email = await testAdapter.getVerifiedEmail?.(userId);
    return email ? email.trim().toLowerCase() : null;
  }
  const user = await clerkClient.users.getUser(userId);
  return selectCustomerVerifiedEmail(user);
}

/** Reject a signed-in identity whose app-owned customer record is suspended. */
export async function requireActiveCustomerIdentity(
  userId: string,
  verifiedEmail: string | null,
): Promise<void> {
  const [profile] = await db
    .select({ customerId: customerProfilesTable.customerId })
    .from(customerProfilesTable)
    .where(eq(customerProfilesTable.clerkUserId, userId))
    .limit(1);
  const [customer] = profile
    ? await db.select({ status: customersTable.status }).from(customersTable).where(eq(customersTable.id, profile.customerId)).limit(1)
    : verifiedEmail
      ? await db.select({ status: customersTable.status }).from(customersTable).where(eq(customersTable.email, verifiedEmail)).limit(1)
      : [];
  if (!customerStatusAllowsApi(customer?.status)) {
    throw new ApiError("CUSTOMER_SUSPENDED", "This customer account is suspended.", 403);
  }
}

export const requireCustomer: RequestHandler = async (req, res, next) => {
  const userId = getCustomerActorUserId(req);
  if (!userId) {
    next(
      new ApiError(
        "CUSTOMER_AUTH_REQUIRED",
        "Customer authentication is required.",
        401,
      ),
    );
    return;
  }

  try {
    const email = await getCustomerVerifiedEmail(userId);
    await requireActiveCustomerIdentity(userId, email);
    res.locals.customerClerkUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
};