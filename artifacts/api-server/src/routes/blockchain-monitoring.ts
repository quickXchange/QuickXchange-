import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  blockchainMonitorMatchesTable,
  blockchainMonitorAssetsTable,
  blockchainMonitorObservationsTable,
  blockchainMonitorRegistrationGapsTable,
  blockchainMonitorNetworksTable,
  blockchainMonitorWatchesTable,
  db,
  ordersTable,
  cryptoAssetNetworksTable,
  cryptoAssetsTable,
  orderAuditLogsTable,
} from "@workspace/db";
import { CreateBlockchainMonitoringNetworkBody, EnableSelectedBlockchainMonitoringRoutesBody, UpdateBlockchainMonitoringNetworkBody, ReviewBlockchainMonitoringMatchBody } from "@workspace/api-zod";
import { createBlockchainMonitorAdapter } from "../lib/blockchain-monitoring";
import { adapterConfig, deriveBlockchainMonitoringSetupStatus, exactWatchMatchesOrderSnapshot, isFinalitySatisfied, registerManualBlockchainWatch, selectReadyBlockchainMonitoringSetupRoutes } from "../lib/blockchain-monitoring/service";
import { normalizeTronAddress } from "../lib/blockchain-monitoring/tron";
import { getOperatorActorUserId } from "../lib/operator-auth";
import { ApiError } from "../lib/api-error";
import { updateOrderAndQueueStatusNotificationTx } from "../lib/customer-status-notifications";
import { UpsertBlockchainMonitoringAssetBody } from "@workspace/api-zod";

const router: IRouter = Router();
router.get("/admin/blockchain-monitoring/registration-gaps", async (_req, res, next) => {
  try { res.json({ items: await db.select().from(blockchainMonitorRegistrationGapsTable).where(isNull(blockchainMonitorRegistrationGapsTable.resolvedAt)) }); } catch (error) { next(error); }
});
router.post("/admin/blockchain-monitoring/registration-gaps/:orderId/activate", async (req, res, next) => {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, req.params.orderId)).limit(1);
    if (!order) throw new ApiError("REGISTRATION_GAP_NOT_FOUND", "Registration gap not found.", 404);
    await registerManualBlockchainWatch(order.id, { freshCursor: true });
    const [watch] = await db.select().from(blockchainMonitorWatchesTable)
      .where(and(
        eq(blockchainMonitorWatchesTable.orderId, order.id),
        eq(blockchainMonitorWatchesTable.registrationState, "active"),
        eq(blockchainMonitorWatchesTable.active, true),
      ))
      .limit(1);
    if (!watch) {
      throw new ApiError(
        "REGISTRATION_NOT_READY",
        "The immutable order watch could not be activated from the current chain head.",
        422,
      );
    }
    const actor = getOperatorActorUserId(req);
    await db.transaction(async (tx) => {
      const [lockedGap] = await tx.select().from(blockchainMonitorRegistrationGapsTable).where(eq(blockchainMonitorRegistrationGapsTable.orderId, req.params.orderId)).for("update");
      if (lockedGap) await tx.update(blockchainMonitorRegistrationGapsTable).set({ resolvedAt: new Date(), resolvedBy: actor }).where(eq(blockchainMonitorRegistrationGapsTable.orderId, order.id));
      await tx.insert(orderAuditLogsTable).values({
        orderId: order.id,
        action: "blockchain_monitoring.registration_gap_activated",
        actorType: "operator",
        actorId: actor,
        previousVersion: order.recordVersion,
        nextVersion: order.recordVersion,
        details: { cursor: watch.startCursor },
      });
    });
    res.json(watch);
  } catch (error) { next(error); }
});
const sanitized = (row: typeof blockchainMonitorNetworksTable.$inferSelect) => ({
  ...row,
  endpointSecretRef: undefined,
  apiKeySecretRef: undefined,
  endpointConfigured: Boolean(row.endpointSecretRef && process.env[row.endpointSecretRef]),
  apiKeyConfigured: Boolean(row.apiKeySecretRef && process.env[row.apiKeySecretRef]),
});

async function loadBlockchainMonitoringSetupRoutes(executor: Pick<typeof db, "select"> = db) {
  const [catalogRows, networks, monitorAssets] = await Promise.all([
    executor.select({
      route: cryptoAssetNetworksTable,
      asset: cryptoAssetsTable,
    }).from(cryptoAssetNetworksTable)
      .innerJoin(cryptoAssetsTable, eq(cryptoAssetsTable.id, cryptoAssetNetworksTable.assetId))
      .where(and(
        eq(cryptoAssetNetworksTable.executionMode, "manual"),
        eq(cryptoAssetNetworksTable.depositProvider, "manual"),
      ))
      .orderBy(cryptoAssetsTable.code, cryptoAssetNetworksTable.networkCode),
    executor.select().from(blockchainMonitorNetworksTable),
    executor.select().from(blockchainMonitorAssetsTable),
  ]);
  const networksByCode = new Map(networks.map(network => [network.networkCode.trim().toUpperCase(), network]));
  const monitorAssetsByRoute = new Map(monitorAssets.map(asset => [asset.assetNetworkId, asset]));
  return catalogRows.map(({ route, asset }) => {
    const network = networksByCode.get(route.networkCode.trim().toUpperCase());
    const monitorAsset = monitorAssetsByRoute.get(route.id);
    const networkConfigured = Boolean(
      network &&
      network.providerKind !== "none" &&
      network.endpointSecretRef &&
      process.env[network.endpointSecretRef],
    );
    const status = deriveBlockchainMonitoringSetupStatus({
      catalogEnabled: asset.enabled && route.enabled,
      catalogActive: asset.lifecycle === "active" && route.lifecycle === "active",
      networkConfigured,
      identityKind: monitorAsset?.identityKind,
      contractOrMint: monitorAsset?.contractOrMint,
    });
    return {
      assetNetworkId: route.id,
      assetCode: asset.code,
      assetName: asset.name,
      networkCode: route.networkCode,
      networkName: route.networkName,
      decimals: route.decimals,
      identityKind: monitorAsset?.identityKind === "native" || monitorAsset?.identityKind === "token"
        ? monitorAsset.identityKind
        : null,
      contractOrMint: monitorAsset?.contractOrMint ?? null,
      status,
      monitoringEnabled: Boolean(network?.enabled && monitorAsset?.enabled),
      monitorNetworkId: network?.id,
      monitorAssetId: monitorAsset?.id,
    };
  });
}

router.get("/admin/blockchain-monitoring/setup/routes", async (_req, res, next) => {
  try {
    const items = await loadBlockchainMonitoringSetupRoutes();
    res.json({ items: items.map(({ monitorNetworkId: _network, monitorAssetId: _asset, ...item }) => item) });
  } catch (error) { next(error); }
});

async function enableReadyBlockchainMonitoringRoutes(selectedAssetNetworkIds?: readonly string[]) {
  return db.transaction(async (tx) => {
      const routes = await loadBlockchainMonitoringSetupRoutes(tx);
      const { ready, skippedRoutes } = selectReadyBlockchainMonitoringSetupRoutes(routes, selectedAssetNetworkIds);
      const networkIds = [...new Set(ready.flatMap(route => route.monitorNetworkId ? [route.monitorNetworkId] : []))];
      const assetIds = [...new Set(ready.flatMap(route => route.monitorAssetId ? [route.monitorAssetId] : []))];
      if (networkIds.length) {
        await tx.update(blockchainMonitorNetworksTable)
          .set({ enabled: true })
          .where(inArray(blockchainMonitorNetworksTable.id, networkIds));
      }
      if (assetIds.length) {
        await tx.update(blockchainMonitorAssetsTable)
          .set({ enabled: true })
          .where(inArray(blockchainMonitorAssetsTable.id, assetIds));
      }
      return {
        enabledRoutes: ready.length,
        enabledNetworks: networkIds.length,
        skippedRoutes,
      };
    });
}

router.post("/admin/blockchain-monitoring/setup/enable-ready", async (_req, res, next) => {
  try {
    const result = await enableReadyBlockchainMonitoringRoutes();
    res.json(result);
  } catch (error) { next(error); }
});

router.post("/admin/blockchain-monitoring/setup/enable-selected", async (req, res, next) => {
  try {
    const input = EnableSelectedBlockchainMonitoringRoutesBody.parse(req.body);
    const result = await enableReadyBlockchainMonitoringRoutes(input.assetNetworkIds);
    res.json(result);
  } catch (error) { next(error); }
});

router.get("/admin/blockchain-monitoring/assets/list", async (_req, res, next) => {
  try { res.json({ items: await db.select().from(blockchainMonitorAssetsTable) }); } catch (error) { next(error); }
});
router.post("/admin/blockchain-monitoring/assets/upsert", async (req, res, next) => {
  try {
    const input = UpsertBlockchainMonitoringAssetBody.parse(req.body);
    const [network] = await db.select().from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, input.monitorNetworkId)).limit(1);
    if (!network) { res.status(422).json({ error: "MONITOR_NETWORK_NOT_FOUND", message: "Monitoring network not found." }); return; }
    const normalizedContract = network.adapterKind === "tron" && input.contractOrMint ? normalizeTronAddress(input.contractOrMint) : input.contractOrMint;
    if (input.identityKind === "token" && !normalizedContract) { res.status(422).json({ error: "INVALID_CONTRACT_OR_MINT", message: "The token contract or mint is invalid for the configured network." }); return; }
    const values = { ...input, contractOrMint: normalizedContract };
    const [row] = await db.insert(blockchainMonitorAssetsTable).values(values)
      .onConflictDoUpdate({ target: [blockchainMonitorAssetsTable.monitorNetworkId, blockchainMonitorAssetsTable.assetNetworkId], set: values }).returning();
    res.json(row);
  } catch (error) { next(error); }
});

router.get("/admin/blockchain-monitoring/networks", async (_req, res, next) => {
  try {
    const rows = await db.select().from(blockchainMonitorNetworksTable).orderBy(blockchainMonitorNetworksTable.networkCode);
    res.json({ items: rows.map(sanitized) });
  } catch (error) { next(error); }
});

router.post("/admin/blockchain-monitoring/networks", async (req, res, next) => {
  try {
    const input = CreateBlockchainMonitoringNetworkBody.parse(req.body);
    if (input.finalityPolicy === "finalized" && input.adapterKind === "evm") {
      res.status(422).json({ error: "UNSUPPORTED_FINALITY_POLICY", message: "EVM finalized monitoring is not enabled until the provider exposes a verified finalized proof." }); return;
    }
    const [row] = await db.insert(blockchainMonitorNetworksTable).values(input).returning();
    res.status(201).json(sanitized(row!));
  } catch (error) { next(error); }
});

router.patch("/admin/blockchain-monitoring/networks/:id", async (req, res, next) => {
  try {
    const input = UpdateBlockchainMonitoringNetworkBody.parse(req.body);
    if (input.finalityPolicy === "finalized" && input.adapterKind === "evm") {
      res.status(422).json({ error: "UNSUPPORTED_FINALITY_POLICY", message: "EVM finalized monitoring is not enabled until the provider exposes a verified finalized proof." }); return;
    }
    const [row] = await db.update(blockchainMonitorNetworksTable).set(input).where(eq(blockchainMonitorNetworksTable.id, req.params.id)).returning();
    if (!row) { res.status(404).json({ error: "MONITOR_NETWORK_NOT_FOUND", message: "Monitoring network not found." }); return; }
    res.json(sanitized(row));
  } catch (error) { next(error); }
});

router.post("/admin/blockchain-monitoring/networks/:id/test", async (req, res, next) => {
  try {
    const [row] = await db.select().from(blockchainMonitorNetworksTable).where(eq(blockchainMonitorNetworksTable.id, req.params.id)).limit(1);
    if (!row) { res.status(404).json({ error: "MONITOR_NETWORK_NOT_FOUND", message: "Monitoring network not found." }); return; }
    const endpoint = row.endpointSecretRef ? process.env[row.endpointSecretRef] : undefined;
    if (!endpoint) { res.status(422).json({ error: "MONITOR_NOT_CONFIGURED", message: "The provider endpoint is not configured." }); return; }
    const adapter = createBlockchainMonitorAdapter({ networkCode: row.networkCode, provider: row.providerKind as "rpc" | "indexer", endpoint, apiKey: row.apiKeySecretRef ? process.env[row.apiKeySecretRef] : undefined });
    res.json(await adapter.testConnection());
  } catch (error) { next(error); }
});

router.get("/admin/blockchain-monitoring/watches", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await db.select().from(blockchainMonitorWatchesTable)
      .where(req.query.state === "active" ? eq(blockchainMonitorWatchesTable.active, true) : req.query.state === "inactive" ? eq(blockchainMonitorWatchesTable.active, false) : undefined)
      .orderBy(desc(blockchainMonitorWatchesTable.createdAt)).limit(limit);
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.get("/admin/blockchain-monitoring/matches", async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = await db.select().from(blockchainMonitorMatchesTable)
      .where(typeof req.query.state === "string" ? eq(blockchainMonitorMatchesTable.state, req.query.state) : undefined)
      .orderBy(desc(blockchainMonitorMatchesTable.createdAt)).limit(limit);
    res.json({ items: rows });
  } catch (error) { next(error); }
});

router.post("/admin/blockchain-monitoring/matches/:id/review", async (req, res, next) => {
  try {
    const input = ReviewBlockchainMonitoringMatchBody.parse(req.body);
    let reviewStatus: Awaited<ReturnType<ReturnType<typeof createBlockchainMonitorAdapter>["getEvidenceStatus"]>> | undefined;
    if (input.decision === "approve") {
      const [preflight] = await db.select({ match: blockchainMonitorMatchesTable, observation: blockchainMonitorObservationsTable, network: blockchainMonitorNetworksTable, order: ordersTable })
        .from(blockchainMonitorMatchesTable).innerJoin(blockchainMonitorObservationsTable, eq(blockchainMonitorObservationsTable.id, blockchainMonitorMatchesTable.observationId))
        .innerJoin(blockchainMonitorNetworksTable, eq(blockchainMonitorNetworksTable.id, blockchainMonitorObservationsTable.monitorNetworkId))
        .innerJoin(ordersTable, eq(ordersTable.id, blockchainMonitorMatchesTable.orderId)).where(eq(blockchainMonitorMatchesTable.id, req.params.id)).limit(1);
      if (preflight?.order.status === "needs review" && preflight.order.manualSettlementState === "funds_confirmed") {
        const config = adapterConfig(preflight.network);
        if (!config) throw new ApiError("MONITORING_NOT_CONFIGURED", "Monitoring provider is not configured.", 409);
        reviewStatus = await createBlockchainMonitorAdapter(config).getEvidenceStatus({ transactionHash: preflight.observation.transactionHash, blockOrSlot: preflight.observation.blockReference, blockHash: preflight.observation.blockHash ?? undefined } as any);
        if (!reviewStatus.exists || !reviewStatus.successful || !reviewStatus.canonical || !isFinalitySatisfied(preflight.network.finalityPolicy, reviewStatus.confirmations, preflight.match.confirmationsRequired, reviewStatus.finalized)) throw new ApiError("BLOCKCHAIN_EVIDENCE_NOT_FINAL", "Fresh canonical finalized evidence is required.", 409);
      }
    }
    const row = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(blockchainMonitorMatchesTable)
        .where(and(eq(blockchainMonitorMatchesTable.id, req.params.id), eq(blockchainMonitorMatchesTable.state, "needs_review"))).limit(1);
      if (!current) return undefined;
      if (input.decision === "approve") {
        await tx.update(blockchainMonitorMatchesTable).set({ state: "rejected", ambiguityReason: "Another candidate was approved.", reviewedAt: new Date(), reviewedBy: getOperatorActorUserId(req) }).where(and(eq(blockchainMonitorMatchesTable.observationId, current.observationId), eq(blockchainMonitorMatchesTable.state, "needs_review"), sql`${blockchainMonitorMatchesTable.id} <> ${current.id}`));
      }
      if (input.decision === "reject") {
        const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, current.orderId)).limit(1);
        if (order?.status === "needs review" && order.manualSettlementState === "funds_confirmed") {
          const transitioned = await updateOrderAndQueueStatusNotificationTx(tx, order, {
            status: "awaiting funds", manualSettlementState: "awaiting_funds",
            manualSettlementStateUpdatedAt: new Date(), manualSettlementFundedAt: null,
            incomingTransactionReference: "",
          }, and(eq(ordersTable.status, "needs review"), eq(ordersTable.manualSettlementState, "funds_confirmed")),
          { action: "blockchain_monitoring.review_rejected_invalidated_payment", details: { reason: input.reason ?? null } });
          if (!transitioned) throw new ApiError("ORDER_STATUS_CONFLICT", "The order changed concurrently.", 409);
          await tx.insert(blockchainMonitorRegistrationGapsTable).values({
            orderId: order.id,
            networkCode: order.fromNetwork,
            assetCode: order.fromAsset,
            receivingAddress: order.depositAddress,
            reason: "Payment evidence was rejected; watch requires fresh reactivation.",
          }).onConflictDoUpdate({
            target: blockchainMonitorRegistrationGapsTable.orderId,
            set: {
              reason: "Payment evidence was rejected; watch requires fresh reactivation.",
              resolvedAt: null,
              resolvedBy: null,
            },
          });
          const [updated] = await tx.update(blockchainMonitorMatchesTable).set({ state: "rejected", reviewedAt: new Date(), reviewedBy: getOperatorActorUserId(req), ambiguityReason: input.reason ?? "Operator rejected the reorg review." }).where(eq(blockchainMonitorMatchesTable.id, current.id)).returning();
          return updated;
        }
        if (order?.status === "needs review" && order.manualSettlementState === "awaiting_funds") {
          const transitioned = await updateOrderAndQueueStatusNotificationTx(tx, order, {
            status: "awaiting funds",
          }, and(
            eq(ordersTable.status, "needs review"),
            eq(ordersTable.manualSettlementState, "awaiting_funds"),
          ), {
            action: "blockchain_monitoring.review_rejected_unconfirmed_payment",
            details: { reason: input.reason ?? null },
          });
          if (!transitioned) throw new ApiError("ORDER_STATUS_CONFLICT", "The order changed concurrently.", 409);
          const [updated] = await tx.update(blockchainMonitorMatchesTable).set({
            state: "rejected",
            reviewedAt: new Date(),
            reviewedBy: getOperatorActorUserId(req),
            ambiguityReason: input.reason ?? "Operator rejected invalid unconfirmed payment evidence.",
          }).where(eq(blockchainMonitorMatchesTable.id, current.id)).returning();
          return updated;
        }
      }
      if (input.decision === "approve") {
        const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, current.orderId)).limit(1);
        if (!order) return undefined;
        if (order.status === "needs review" && order.manualSettlementState === "funds_confirmed") {
          if (!reviewStatus) throw new ApiError("BLOCKCHAIN_EVIDENCE_NOT_FINAL", "Fresh canonical finalized evidence is required.", 409);
          await tx.update(blockchainMonitorObservationsTable).set({ confirmations: reviewStatus.confirmations, finalized: reviewStatus.finalized, blockHash: reviewStatus.blockHash ?? undefined, blockTimestamp: reviewStatus.blockTimestamp ? new Date(reviewStatus.blockTimestamp) : undefined }).where(eq(blockchainMonitorObservationsTable.id, current.observationId));
          await tx.update(ordersTable).set({ status: "processing", statusVersion: sql`${ordersTable.statusVersion} + 1`, recordVersion: sql`${ordersTable.recordVersion} + 1` }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "needs review")));
          const [updated] = await tx.update(blockchainMonitorMatchesTable).set({ state: "applied", reviewedAt: new Date(), reviewedBy: getOperatorActorUserId(req) }).where(eq(blockchainMonitorMatchesTable.id, current.id)).returning();
          return updated;
        }
        if (order.status === "processing" && order.manualSettlementState === "funds_confirmed") {
          const [observation] = await tx.select().from(blockchainMonitorObservationsTable).where(eq(blockchainMonitorObservationsTable.id, current.observationId)).limit(1);
          if (!observation?.finalized) throw new ApiError("BLOCKCHAIN_EVIDENCE_NOT_FINAL", "The payment is not currently canonical and finalized.", 409);
          const [updated] = await tx.update(blockchainMonitorMatchesTable).set({ state: "applied" })
            .where(and(eq(blockchainMonitorMatchesTable.id, current.id), eq(blockchainMonitorMatchesTable.state, "needs_review"))).returning();
          return updated;
        }
        if (order.manualSettlementState !== "awaiting_funds") return undefined;
        const transitioned = await updateOrderAndQueueStatusNotificationTx(tx, order, { status: "payment detected" },
          eq(ordersTable.status, "awaiting funds"), { action: "blockchain_monitoring.review_approved" });
        if (!transitioned) return undefined;
      }
      const [updated] = await tx.update(blockchainMonitorMatchesTable).set({
        state: input.decision === "approve" ? "confirming" : "rejected",
        ambiguityReason: input.reason ?? null, reviewedAt: new Date(), reviewedBy: getOperatorActorUserId(req),
      }).where(and(eq(blockchainMonitorMatchesTable.id, req.params.id), eq(blockchainMonitorMatchesTable.state, "needs_review"))).returning();
      return updated;
    });
    if (!row) { res.status(404).json({ error: "MONITOR_MATCH_NOT_FOUND", message: "Reviewable monitoring match not found." }); return; }
    res.json(row);
  } catch (error) { next(error); }
});

export default router;