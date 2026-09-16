import { Router, type IRouter } from "express";
import {
  CreateQuickexOrderBody, CreateQuickexOrderResponse, CreateQuickexQuoteBody,
  CreateQuickexQuoteResponse, GetQuickexConfigResponse, GetQuickexCredentialsResponse,
  GetQuickexDiagnosticsResponse, GetQuickexOrderStatusParams, GetQuickexOrderStatusResponse,
  TestQuickexCredentialsResponse,
  UpdateQuickexCredentialsBody, UpdateQuickexCredentialsResponse, ValidateQuickexAddressBody,
  ValidateQuickexAddressResponse,
} from "@workspace/api-zod";
import {
  acceptQuickexRuntimeVerification,
  getQuickexCredentialStatus, getQuickexInstrumentCacheHealth,
  QuickexApiError, testQuickexConnection, testQuickexCredentials,
  validateQuickexAddress,
} from "../lib/quickex";
import { ApiError } from "../lib/api-error";
import { signQuoteTicket } from "../lib/quote-ticket";
import { activateQuickexCredentials } from "../lib/provider-credentials";
import { getOperatorActorUserId, requireOperator, requireOwner } from "../lib/operator-auth";
import { createQuickexConvertOrder, getQuickexOrderStatus, getQuickexReconciliationHealth, outputQuickexOrder } from "../lib/quickex-order-service";
import { getCustomerActorUserId, getCustomerVerifiedEmail, requireActiveCustomerIdentity } from "../lib/customer-auth";
import { initializeAffiliateForOrder } from "../lib/affiliate-accounting";
import {
  buildProviderQuoteTicket,
  getQuickexPublicCapabilityConfig,
  listExecutableProviderCapabilities,
} from "../lib/provider-capabilities";

const router: IRouter = Router();
// This router is mounted below /quickex, so its Admin surface needs its own
// operator boundary rather than relying on the top-level /admin guard.
router.use("/admin", requireOperator);
async function getOperatorQuickexStatus(canManage: boolean) {
  const [status, reconciliation] = await Promise.all([
    getQuickexCredentialStatus(canManage),
    getQuickexReconciliationHealth(),
  ]);
  return { ...status, reconciliation };
}
const invalid = (res: import("express").Response, result: { error: { message: string } }) => {
  res.status(400).json({ error: result.error.message });
};

router.get("/config", async (_req, res): Promise<void> => {
  const config = GetQuickexConfigResponse.parse(await getQuickexPublicCapabilityConfig());
  res.setHeader("cache-control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
  res.json(config);
});
router.post("/quote", async (req, res): Promise<void> => {
  const parsed = CreateQuickexQuoteBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const input = parsed.data;
  if (input.type !== "instant") throw new ApiError("VALIDATION_ERROR", "Quickex only supports instant convert orders.", 400);
  const ticket = await buildProviderQuoteTicket(input);
  res.json(CreateQuickexQuoteResponse.parse({ ...ticket, quoteId: signQuoteTicket(ticket), expiresAt: new Date(ticket.expiresAt).toISOString() }));
});
router.post("/create-order", async (req, res): Promise<void> => {
  const customerClerkUserId = getCustomerActorUserId(req);
  const verifiedCustomerEmail = customerClerkUserId
    ? await getCustomerVerifiedEmail(customerClerkUserId)
    : null;
  if (customerClerkUserId && !verifiedCustomerEmail) {
    throw new ApiError(
      "CUSTOMER_VERIFIED_EMAIL_REQUIRED",
      "Verify an email address on your account before creating an order.",
      422,
    );
  }
  if (customerClerkUserId) await requireActiveCustomerIdentity(customerClerkUserId, verifiedCustomerEmail);
  if (customerClerkUserId) {
    const referral = typeof req.cookies?.affiliate_referral === "string" ? req.cookies.affiliate_referral : undefined;
    const affiliate = await initializeAffiliateForOrder(customerClerkUserId, referral);
    if (referral && affiliate.referralStatus !== "unavailable") res.clearCookie("affiliate_referral");
  }
  const parsed = CreateQuickexOrderBody.safeParse(
    verifiedCustomerEmail
      ? { ...req.body, customerEmail: verifiedCustomerEmail }
      : req.body,
  );
  if (!parsed.success) return invalid(res, parsed);
  const quoteId = parsed.data.quoteId ?? "";
  if (!quoteId) throw new ApiError("QUOTE_INVALID", "A quoteId is required.", 400);
  if (parsed.data.type !== "instant") throw new ApiError("VALIDATION_ERROR", "Quickex only supports instant convert orders.", 400);
  let customerEmail: string | undefined = parsed.data.customerEmail;
  if (!customerClerkUserId && !customerEmail) {
    throw new ApiError("CUSTOMER_EMAIL_REQUIRED", "A customer email is required.", 400);
  }
  const result = await createQuickexConvertOrder({
    ...parsed.data,
    quoteId,
    customerEmail,
    customerClerkUserId: customerClerkUserId ?? undefined,
  });
  res.status(result.created ? (result.uncertain ? 202 : 201) : 200)
    .json(CreateQuickexOrderResponse.parse(outputQuickexOrder(result.row)));
});
router.get("/orders/:id/status", async (req, res): Promise<void> => {
  const params = GetQuickexOrderStatusParams.safeParse(req.params);
  if (!params.success) return invalid(res, params);
  const row = await getQuickexOrderStatus(
    params.data.id,
    typeof req.query.trackingToken === "string" ? req.query.trackingToken : undefined,
  );
  res.json(GetQuickexOrderStatusResponse.parse(row));
});
router.post("/validate-address", async (req, res): Promise<void> => {
  const parsed = ValidateQuickexAddressBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const input = parsed.data;
  const instrument = (await listExecutableProviderCapabilities()).find(item =>
    item.assetCode.toUpperCase() === input.asset.toUpperCase() &&
    item.networkCode.toUpperCase() === input.network.toUpperCase()
  );
  if (!instrument) throw new ApiError("QUICKEX_ROUTE_INVALID", "This exchange route is unavailable.", 422);
  if (instrument.requiresMemo && !input.memo) throw new ApiError("QUICKEX_INVALID_MEMO", "A destination memo is required for this network.", 400);
  await validateQuickexAddress({ currencyTitle: input.asset, networkTitle: input.network, address: input.address, memo: input.memo });
  res.json(ValidateQuickexAddressResponse.parse({ valid: true, requiresMemo: instrument.requiresMemo }));
});
router.get("/admin/credentials", requireOperator, async (req, res): Promise<void> => {
  res.json(GetQuickexCredentialsResponse.parse(
    await getOperatorQuickexStatus(res.locals.operator?.role === "owner"),
  ));
});
router.put("/admin/credentials", requireOwner, async (req, res): Promise<void> => {
  const parsed = UpdateQuickexCredentialsBody.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const actor = res.locals.operator;
  let verification;
  try {
    ({ verification } = await testQuickexCredentials(parsed.data));
  } catch (error) {
    if (error instanceof QuickexApiError && error.code === "QUICKEX_AUTH") {
      throw new ApiError(
        "QUICKEX_CREDENTIALS_REJECTED",
        "Quickex rejected the submitted credentials.",
        422,
      );
    }
    if (error instanceof QuickexApiError && error.code === "QUICKEX_AUTH_AMBIGUOUS") {
      throw new ApiError(
        "QUICKEX_CREDENTIALS_AMBIGUOUS",
        "Quickex returned an ambiguous signed response, so the credentials were not saved.",
        422,
      );
    }
    if (error instanceof QuickexApiError && error.code === "QUICKEX_ACCESS_BLOCKED") {
      throw new ApiError(
        "QUICKEX_PROVIDER_BLOCKED",
        "Quickex is blocking signed API access from this network or account policy. The credentials were not saved.",
        503,
      );
    }
    throw error;
  }
  await activateQuickexCredentials(parsed.data, { actorClerkUserId: getOperatorActorUserId(req)!, operatorId: actor.id, operatorEmail: actor.email, requestId: req.get("x-request-id") ?? null }, verification);
  acceptQuickexRuntimeVerification(verification);
  res.json(UpdateQuickexCredentialsResponse.parse(await getOperatorQuickexStatus(true)));
});
router.get("/admin/diagnostics", requireOperator, async (req, res): Promise<void> => {
  res.json(GetQuickexDiagnosticsResponse.parse({ provider: "Quickex", credentials: await getOperatorQuickexStatus(res.locals.operator?.role === "owner"), instrumentCache: getQuickexInstrumentCacheHealth() }));
});
router.post("/admin/credentials/test", requireOwner, async (_req, res): Promise<void> => {
  res.json(TestQuickexCredentialsResponse.parse(await testQuickexConnection()));
});
export default router;