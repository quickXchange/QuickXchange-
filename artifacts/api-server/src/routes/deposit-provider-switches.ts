import { assertNoManualWalletOperation } from "../lib/manual-wallet-operation-lock";
import { Router, type Request, type Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, cryptoAssetNetworksTable, depositProviderSwitchJobsTable as jobs,
  depositProviderSwitchRoutesTable as routes, operatorsTable, operatorAuditLogsTable } from "@workspace/db";
import {
  CreateCryptoDepositProviderSwitchJobBody, GetCryptoDepositProviderSwitchJobResponse,
  RetryCryptoDepositProviderSwitchRouteBody,
} from "@workspace/api-zod";
import { ApiError } from "../lib/api-error";
import { WhitebitProviderHttpError } from "./whitebit";
import { requireOwner, getOperatorActorUserId, getOperatorAuthorization, type OperatorAuthorization } from "../lib/operator-auth";
import { executeDepositProviderSwitch, type SwitchStep } from "../lib/deposit-provider-switch-workflow";
import { logger } from "../lib/logger";
import { applyProviderMonitoring, monitoringSnapshots, manualMonitoringIntentionallyDisabled, type MonitoringOptions } from "../lib/deposit-provider-monitoring";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type SwitchActor = { operator: OperatorAuthorization; clerkUserId: string; requestId: string };
export type SwitchFence = (tx: Tx) => Promise<void>;
type Input = ReturnType<typeof CreateCryptoDepositProviderSwitchJobBody.parse>;
type Job = typeof jobs.$inferSelect;
type Route = typeof routes.$inferSelect;
export interface DepositSwitchActions {
  prepare(input: Input): Promise<{ reviewToken: string; routes: { networkId: string; mapping: Route["mapping"] }[] }>;
  assign(id: string, provider: string, mapping: Route["mapping"], actor: SwitchActor, fence: SwitchFence, invalidateProof: boolean): Promise<Route["mapping"]>;
  verify(id: string, provider: string, actor: SwitchActor, fence: SwitchFence, monitoring?: MonitoringOptions | null): Promise<void>;
  setEnabled(id: string, enabled: boolean, actor: SwitchActor, fence: SwitchFence,
    expected?: { provider: string; mapping: Route["mapping"] }): Promise<unknown>;
}

export function providerSwitchSourceDigest(network: typeof cryptoAssetNetworksTable.$inferSelect) {
  return createHash("sha256").update(JSON.stringify([
    network.id, network.assetId, network.networkCode, network.executionMode,
  ])).digest("hex");
}
const routeWhere = (jobId: string, networkId: string) =>
  and(eq(routes.jobId, jobId), eq(routes.networkId, networkId));
const uniqueViolation = (error: unknown): boolean => Boolean(error && typeof error === "object" &&
  ("code" in error && error.code === "23505" || "cause" in error && uniqueViolation(error.cause)));
const messages: Record<SwitchStep, string> = {
  disabling: "Safely disabling new customer deposits",
  assigning: "Saving provider and exact route mapping",
  monitoring: "Configuring RPC monitoring with obligation and shared-network protection",
  verifying: "Verifying live provider permission and route readiness",
  restoring: "Restoring original Customer Deposits ON state",
  checking: "Checking actual saved provider, mapping and deposit state",
};

export function createDepositProviderSwitchRouter(actions: DepositSwitchActions) {
  const router = Router();
  const base = "/admin/crypto-networks/deposit-provider/jobs";
  // No anonymous/Operator fallback: all read, start, retry and recovery requests
  // pass the same trusted Owner/second-factor middleware as individual controls.
  router.use(base, requireOwner);
  const waiting = new Map<string, { jobId: string; networkId: string }>();
  const running = new Set<string>();
  let active = 0;
  const actorFromRequest = (req: Request, res: Response): SwitchActor => {
    const clerkUserId = getOperatorActorUserId(req);
    if (!clerkUserId) throw new ApiError("OWNER_AUTHORIZATION_REQUIRED", "Owner authorization is required.", 401);
    return { operator: res.locals.operator, clerkUserId, requestId: String(req.id) };
  };
  async function actorForJob(job: Job): Promise<SwitchActor> {
    const operator = await getOperatorAuthorization(job.actorClerkUserId);
    if (!operator || operator.role !== "owner" || operator.id !== job.actorId ||
      operator.authVersion !== job.actorAuthVersion) {
      throw new ApiError("OWNER_AUTHORIZATION_CHANGED", "The authorizing Owner is no longer authorized. Deposits remain disabled.", 403);
    }
    return { operator, clerkUserId: job.actorClerkUserId, requestId: `provider-switch:${job.id}` };
  }
  async function snapshot(id: string) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!job) throw new ApiError("PROVIDER_SWITCH_NOT_FOUND", "Provider switch operation not found.", 404);
    const records = await db.select({ route: routes, network: cryptoAssetNetworksTable })
      .from(routes).leftJoin(cryptoAssetNetworksTable, eq(routes.networkId, cryptoAssetNetworksTable.id))
      .where(eq(routes.jobId, id)).orderBy(routes.networkId);
    const monitorState = await monitoringSnapshots(records.map(row => row.route.networkId));
    return GetCryptoDepositProviderSwitchJobResponse.parse({
      id: job.id, depositProvider: job.depositProvider, createdAt: job.createdAt,
      ...(job.monitoring ? { monitoring: job.monitoring } : {}),
      routes: records.map(({ route, network }) => ({
        networkId: route.networkId, originalCustomerDepositsEnabled: route.originalCustomerDepositsEnabled,
        status: route.status, step: route.step, message: route.message, errorCode: route.errorCode,
        attempts: route.attempts, customerDepositsEnabled: network?.customerDepositsEnabled ?? false,
        savedProvider: network?.depositProvider ?? "none",
        rpcTrackingEnabled: network?.manualWalletTrackingEnabled ?? false,
        monitoringMessage: route.monitoringMessage,
        ...(monitorState.get(route.networkId) ?? { rpcStatus: "NOT_CONFIGURED", networkMonitorEnabled: null, assetMonitoringEnabled: null }),
      })),
    });
  }
  async function recover(id: string) {
    // No remote address request is replayed after a lost worker. An Owner must
    // explicitly retry; current proof can then be reused by the provider service.
    await db.transaction(async tx => {
      const expired = await tx.select().from(routes).where(and(
        eq(routes.jobId, id), eq(routes.status, "running"), lt(routes.leaseUntil, new Date()),
      )).for("update");
      for (const row of expired) {
        await tx.update(cryptoAssetNetworksTable).set({ customerDepositsEnabled: false })
          .where(eq(cryptoAssetNetworksTable.id, row.networkId));
        await tx.update(routes).set({
          status: "failed", step: "failed", runToken: null, leaseUntil: null,
          errorCode: "PROVIDER_SWITCH_INTERRUPTED",
          message: "Verification was interrupted. Deposits are OFF. Explicitly retry after reviewing possible provider-side address creation.",
          updatedAt: new Date(),
        }).where(routeWhere(id, row.networkId));
        const [job] = await tx.select().from(jobs).where(eq(jobs.id, id));
        await tx.insert(operatorAuditLogsTable).values({
          action: "crypto_deposit_provider.switch_interrupted", actorClerkUserId: job.actorClerkUserId,
          targetOperatorId: job.actorId, requestId: `provider-switch:${id}`,
          details: { networkId: row.networkId, previousStep: row.step, customerDepositsAfter: false },
        });
      }
    });
  }
  async function run(jobId: string, networkId: string) {
    const token = randomUUID();
    const [row] = await db.update(routes).set({
      status: "running", runToken: token, leaseUntil: new Date(Date.now() + 15 * 60_000),
      attempts: sql`${routes.attempts} + 1`, errorCode: null, updatedAt: new Date(),
    }).where(and(routeWhere(jobId, networkId), eq(routes.status, "queued"))).returning();
    if (!row) return;
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
    const own = () => and(routeWhere(jobId, networkId), eq(routes.runToken, token), eq(routes.status, "running"));
    const fence: SwitchFence = async tx => {
      const [current] = await tx.select().from(routes).where(own()).limit(1);
      if (!current || !current.leaseUntil || current.leaseUntil.getTime() <= Date.now()) {
        throw new ApiError("PROVIDER_SWITCH_LEASE_LOST", "The provider switch ownership changed; no stale operation can enable deposits.", 409);
      }
      const [operator] = await tx.select().from(operatorsTable).where(eq(operatorsTable.id, job.actorId)).limit(1);
      if (!operator || operator.status !== "active" || operator.role !== "owner" ||
        operator.authVersion !== job.actorAuthVersion || operator.clerkUserId !== job.actorClerkUserId) {
        throw new ApiError("OWNER_AUTHORIZATION_CHANGED", "Owner authorization changed during the operation.", 403);
      }
    };
    // Heartbeats do not pin a pooled DB connection while waiting for provider IO.
    const heartbeat = setInterval(() => {
      void db.update(routes).set({ leaseUntil: new Date(Date.now() + 15 * 60_000) })
        .where(own()).catch(() => undefined);
    }, 30_000);
    heartbeat.unref();
    try {
      const actor = await actorForJob(job);
      const expected = { provider: job.depositProvider, mapping: row.mapping };
      const assertSaved = async (checkEnabled = false) => {
        const [network] = await db.select().from(cryptoAssetNetworksTable)
          .where(eq(cryptoAssetNetworksTable.id, networkId));
        if (!network || providerSwitchSourceDigest(network) !== row.sourceDigest ||
          network.depositProvider !== job.depositProvider ||
          row.mapping && (network.whitebitAssetCode !== row.mapping.assetCode ||
            network.whitebitNetworkCode !== row.mapping.networkCode) ||
          checkEnabled && network.customerDepositsEnabled !==
            (row.originalCustomerDepositsEnabled && job.depositProvider !== "none" &&
              !manualMonitoringIntentionallyDisabled(job.depositProvider, job.monitoring))) {
          throw new ApiError("CRYPTO_PROVIDER_SWITCH_CHANGED", "Final saved route settings differ from the authorized assignment.", 409);
        }
      };
      await executeDepositProviderSwitch(row.originalCustomerDepositsEnabled &&
        !manualMonitoringIntentionallyDisabled(job.depositProvider, job.monitoring), job.depositProvider, {
        progress: async step => {
          await actorForJob(job);
          const updated = await db.update(routes).set({ step, message: messages[step],
            ...(step === "verifying" ? { verificationStartedAt: new Date() } : {}), updatedAt: new Date(),
          }).where(own()).returning({ id: routes.networkId });
          if (!updated.length) throw new ApiError("PROVIDER_SWITCH_LEASE_LOST", "Operation ownership changed.", 409);
        },
        disable: async () => { await actions.setEnabled(networkId, false, actor, fence); },
        assign: async () => {
          const [network] = await db.select().from(cryptoAssetNetworksTable).where(eq(cryptoAssetNetworksTable.id, networkId));
          if (!network || providerSwitchSourceDigest(network) !== row.sourceDigest) {
            throw new ApiError("CRYPTO_PROVIDER_SWITCH_CHANGED", "The asset/network identity changed. Review a new assignment.", 409);
          }
          const mapping = await actions.assign(networkId, job.depositProvider, row.mapping, actor, fence, !row.verificationStartedAt);
          const saved = await db.update(routes).set({ mapping }).where(own()).returning({ id: routes.networkId });
          if (!saved.length) throw new ApiError("PROVIDER_SWITCH_LEASE_LOST", "Operation ownership changed.", 409);
          row.mapping = mapping;
          expected.mapping = mapping;
        },
        ...(job.monitoring ? { configureMonitoring: async () => {
          const message = await applyProviderMonitoring(networkId, job.depositProvider, job.monitoring, actor, fence);
          await db.transaction(async tx => {
            await fence(tx);
            await tx.update(routes).set({ monitoringMessage: message }).where(own());
          });
        } } : {}),
        verify: async () => { await assertSaved(); await actions.verify(networkId, job.depositProvider, actor, fence, job.monitoring); },
        restore: async () => { await actions.setEnabled(networkId, true, actor, fence, expected); },
        check: async () => { await assertSaved(true); },
      });
      await db.transaction(async tx => {
        await fence(tx);
        await tx.update(routes).set({
          status: "succeeded", step: "completed", message: manualMonitoringIntentionallyDisabled(job.depositProvider, job.monitoring)
            ? "Monitoring disabled as requested; Manual Customer Deposits remain OFF"
            : job.depositProvider === "none"
            ? "Provider removed; Customer Deposits safely OFF"
            : row.originalCustomerDepositsEnabled ? "Verified; original Customer Deposits ON restored" : "Verified; originally OFF remains OFF",
          leaseUntil: null, runToken: null, updatedAt: new Date(),
        }).where(own());
        await tx.insert(operatorAuditLogsTable).values({
          action: "crypto_deposit_provider.switch_completed", actorClerkUserId: actor.clerkUserId,
          targetOperatorId: actor.operator.id, targetEmail: actor.operator.email, requestId: actor.requestId,
          details: { networkId, provider: job.depositProvider, originallyEnabled: row.originalCustomerDepositsEnabled },
        });
      });
    } catch (error) {
      // Only the current operation may fail-closed. An obsolete worker cannot
      // disable or overwrite a newer assignment after losing its lease.
      await db.transaction(async tx => {
        const [current] = await tx.select().from(routes).where(own()).for("update");
        if (!current) return;
        await tx.update(cryptoAssetNetworksTable).set({ customerDepositsEnabled: false })
          .where(eq(cryptoAssetNetworksTable.id, networkId));
        await tx.update(routes).set({
          status: "failed", step: "failed", errorCode: error instanceof ApiError ? error.code : "PROVIDER_SWITCH_FAILED",
          message: error instanceof WhitebitProviderHttpError
            ? `WhiteBIT verification failed (HTTP ${error.providerStatus}). ${error.message} ${
              [401, 403].includes(error.providerStatus)
                ? "Check API access, address-creation permissions and provider IP restrictions before retrying."
                : error.providerStatus === 429
                  ? "Provider rate limit reached. Wait before retrying."
                  : "Review the exact mapping and provider availability before retrying."
            }`
            : error instanceof ApiError ? error.message : "Provider verification failed unexpectedly; deposits remain OFF. Retry after checking configuration.",
          runToken: null, leaseUntil: null, updatedAt: new Date(),
        }).where(own());
        await tx.insert(operatorAuditLogsTable).values({
          action: "crypto_deposit_provider.switch_failed", actorClerkUserId: job.actorClerkUserId,
          targetOperatorId: job.actorId, requestId: `provider-switch:${jobId}`,
          details: { networkId, errorCode: error instanceof ApiError ? error.code : "PROVIDER_SWITCH_FAILED", customerDepositsAfter: false },
        });
      });
      logger.warn({ jobId, networkId, code: error instanceof ApiError ? error.code : "PROVIDER_SWITCH_FAILED" }, "Bulk provider route safely failed");
    } finally {
      clearInterval(heartbeat);
    }
  }
  function pump() {
    while (active < 2 && waiting.size) {
      const [key, item] = waiting.entries().next().value!;
      waiting.delete(key);
      if (running.has(key)) continue;
      running.add(key);
      active++;
      void run(item.jobId, item.networkId).catch(() => {
        logger.error({ jobId: item.jobId, networkId: item.networkId }, "Provider switch worker interrupted; durable lease will require explicit recovery");
      }).finally(() => { active--; running.delete(key); pump(); });
    }
  }
  async function wake(id: string) {
    const pending = await db.select({ networkId: routes.networkId }).from(routes)
      .where(and(eq(routes.jobId, id), eq(routes.status, "queued")));
    for (const row of pending) {
      const key = `${id}:${row.networkId}`;
      if (!running.has(key)) waiting.set(key, { jobId: id, networkId: row.networkId });
    }
    pump();
  }
  if (process.env.NODE_ENV !== "test") {
    // Queued work survives a server restart without requiring a browser to
    // remain open. Expired in-flight verification is never replayed blindly.
    const recovery = setInterval(() => {
      void (async () => {
        const pending = await db.selectDistinct({ jobId: routes.jobId }).from(routes)
          .where(inArray(routes.status, ["queued", "running"])).limit(100);
        for (const row of pending) { await recover(row.jobId); await wake(row.jobId); }
      })().catch(() => logger.warn({ code: "PROVIDER_SWITCH_RECOVERY_UNAVAILABLE" }, "Provider switch recovery is temporarily unavailable"));
    }, 30_000);
    recovery.unref();
  }
  router.post(base, async (req, res, next) => {
    try {
      const input = CreateCryptoDepositProviderSwitchJobBody.parse(req.body);
      if (!input.confirmRealAddressCreation) throw new ApiError("ADDRESS_CREATION_CONFIRMATION_REQUIRED", "Confirm live provider address-permission checks before starting.", 400);
      const requestDigest = createHash("sha256").update(JSON.stringify({
        ...(input.monitoring ? { monitoring: {
          rpcMonitoring: input.monitoring.rpcMonitoring ?? "auto",
          networkMonitor: input.monitoring.networkMonitor ?? "auto",
          assetMonitoring: input.monitoring.assetMonitoring ?? "auto",
        } } : {}),
        ids: [...input.networkIds].sort(), provider: input.depositProvider,
        mappings: [...(input.whitebitMappings ?? [])].sort((a, b) => a.networkId.localeCompare(b.networkId)),
      })).digest("hex");
      const actor = actorFromRequest(req, res);
      const [existing] = await db.select().from(jobs).where(eq(jobs.id, input.operationId));
      if (existing) {
        if (existing.requestDigest !== requestDigest || existing.actorId !== actor.operator.id) {
          throw new ApiError("PROVIDER_SWITCH_IDEMPOTENCY_CONFLICT", "This operation ID belongs to a different assignment.", 409);
        }
      } else {
        const prepared = await actions.prepare(input);
        await db.transaction(async tx => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext('whitebit-provider'))`);
          const [authorized] = await tx.select().from(operatorsTable)
            .where(eq(operatorsTable.id, actor.operator.id)).for("share");
          if (!authorized || authorized.role !== "owner" || authorized.status !== "active" ||
            authorized.authVersion !== actor.operator.authVersion || authorized.clerkUserId !== actor.clerkUserId) {
            throw new ApiError("OWNER_AUTHORIZATION_CHANGED", "Owner authorization changed before the assignment was saved.", 403);
          }
          const [duplicate] = await tx.select().from(jobs).where(eq(jobs.id, input.operationId));
          if (duplicate) {
            if (duplicate.requestDigest !== requestDigest || duplicate.actorId !== actor.operator.id) throw new ApiError("PROVIDER_SWITCH_IDEMPOTENCY_CONFLICT", "Operation ID conflict.", 409);
            return;
          }
          await assertNoManualWalletOperation(tx, input.networkIds);
          const networks = await tx.select().from(cryptoAssetNetworksTable)
            .where(inArray(cryptoAssetNetworksTable.id, input.networkIds)).for("update");
          if (networks.length !== input.networkIds.length) throw new ApiError("CRYPTO_NETWORK_NOT_FOUND", "One or more selected routes were not found.", 404);
          // The read-only review is recomputed with locked rows in the existing
          // service before creation to fence source state changes.
          const currentPrepared = await actions.prepare(input);
          if (currentPrepared.reviewToken !== prepared.reviewToken || currentPrepared.reviewToken !== input.reviewToken) {
            throw new ApiError("CRYPTO_PROVIDER_REVIEW_CHANGED", "Route configuration changed. Review the assignment again.", 409);
          }
          await tx.insert(jobs).values({
            id: input.operationId, requestDigest, depositProvider: input.depositProvider,
            monitoring: input.monitoring ? {
              rpcMonitoring: input.monitoring.rpcMonitoring ?? "auto",
              networkMonitor: input.monitoring.networkMonitor ?? "auto",
              assetMonitoring: input.monitoring.assetMonitoring ?? "auto",
            } : null,
            actorId: actor.operator.id, actorAuthVersion: actor.operator.authVersion, actorClerkUserId: actor.clerkUserId,
          });
          const routeValues = networks.map(network => ({
            jobId: input.operationId, networkId: network.id,
            originalCustomerDepositsEnabled: network.customerDepositsEnabled,
            sourceDigest: providerSwitchSourceDigest(network),
            mapping: currentPrepared.routes.find(route => route.networkId === network.id)?.mapping ?? null,
          }));
          const inserted = await tx.insert(routes).values(routeValues).onConflictDoNothing()
            .returning({ networkId: routes.networkId });
          const insertedIds = new Set(inserted.map(row => row.networkId));
          // Enhanced jobs quiesce every accepted route together. This permits
          // a shared Network Monitor to be safely disabled without another
          // selected-but-queued route accepting a new Manual obligation.
          // Original intent was captured above; busy routes are untouched.
          if (input.monitoring && insertedIds.size) await tx.update(cryptoAssetNetworksTable)
            .set({ customerDepositsEnabled: false })
            .where(inArray(cryptoAssetNetworksTable.id, [...insertedIds]));
          for (const value of routeValues.filter(row => !insertedIds.has(row.networkId))) {
            // Never disable a route owned by another live operation. Report
            // the conflict per route while the remaining selection proceeds.
            const [other] = await tx.select({ jobId: routes.jobId }).from(routes)
              .where(and(eq(routes.networkId, value.networkId), inArray(routes.status, ["queued", "running"]))).limit(1);
            await tx.insert(routes).values({
              ...value, status: "failed", step: "failed", errorCode: "PROVIDER_SWITCH_ALREADY_ACTIVE",
              message: `Not started: operation ${other?.jobId ?? "another operation"} already owns this route. Retry after it finishes.`,
            });
          }
          await tx.insert(operatorAuditLogsTable).values({
            action: "crypto_deposit_provider.switch_authorized", actorClerkUserId: actor.clerkUserId,
            targetOperatorId: actor.operator.id, targetEmail: actor.operator.email, requestId: actor.requestId,
            details: { jobId: input.operationId, depositProvider: input.depositProvider, networkIds: input.networkIds, confirmRealAddressCreation: true },
          });
        });
      }
      const result = await snapshot(input.operationId);
      res.json(result);
      void wake(input.operationId).catch(() => undefined);
    } catch (error) { next(uniqueViolation(error) ? new ApiError("PROVIDER_SWITCH_ALREADY_ACTIVE", "Another provider switch is already active for a selected route. Resume it instead.", 409) : error); }
  });
  router.get(`${base}/:jobId`, async (req, res, next) => {
    try {
      const id = String(req.params.jobId);
      await recover(id);
      res.json(await snapshot(id));
      void wake(id).catch(() => undefined);
    } catch (error) { next(error); }
  });
  router.post(`${base}/:jobId/retry`, async (req, res, next) => {
    try {
      const id = String(req.params.jobId);
      const input = RetryCryptoDepositProviderSwitchRouteBody.parse(req.body);
      if (!input.confirmRealAddressCreation) throw new ApiError("ADDRESS_CREATION_CONFIRMATION_REQUIRED", "Confirm provider permission re-verification before retrying.", 400);
      await recover(id);
      const [selected] = await db.select().from(routes).where(routeWhere(id, input.networkId)).limit(1);
      if (!selected) throw new ApiError("PROVIDER_SWITCH_ROUTE_NOT_FOUND", "This route is not part of the operation.", 404);
      await db.transaction(async tx => {
        await assertNoManualWalletOperation(tx, [input.networkId]);
        await tx.update(routes).set({
          status: "queued", step: "pending", errorCode: null, message: "Retry queued; original deposit state preserved",
          updatedAt: new Date(),
        }).where(and(routeWhere(id, input.networkId), eq(routes.status, "failed")));
      });
      res.json(await snapshot(id));
      void wake(id).catch(() => undefined);
    } catch (error) { next(uniqueViolation(error) ? new ApiError("PROVIDER_SWITCH_ALREADY_ACTIVE", "A newer switch is active for this route. Resume that operation.", 409) : error); }
  });
  return router;
}
