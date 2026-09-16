import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ApproveOperatorResponse,
  ApproveOperatorParams,
  CreateOperatorInvitationResponse,
  CreateOperatorInvitationBody,
  GetOperatorAuditLogsResponse,
  GetOperatorsResponse,
  RemoveOperatorParams,
  SuspendOperatorResponse,
  SuspendOperatorParams,
} from "@workspace/api-zod";
import { db, operatorAuditLogsTable, operatorsTable } from "@workspace/db";
import { ApiError } from "../lib/api-error";
import { getOperatorActorUserId, requireOwner } from "../lib/operator-auth";

const router: IRouter = Router();
router.use("/admin", requireOwner);

type OperatorTransition = "approve" | "suspend" | "remove";
type OperatorTransitionTestHook = (
  transition: OperatorTransition,
  target: typeof operatorsTable.$inferSelect,
) => void | Promise<void>;

let transitionTestHook: OperatorTransitionTestHook | undefined;

export function configureOperatorTransitionHookForTests(
  hook: OperatorTransitionTestHook | undefined,
): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Operator transition test hooks require NODE_ENV=test.");
  }
  transitionTestHook = hook;
}

async function runTransitionTestHook(
  transition: OperatorTransition,
  target: typeof operatorsTable.$inferSelect,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    await transitionTestHook?.(transition, target);
  }
}

function outputOperator(row: typeof operatorsTable.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    linkedToClerk: Boolean(row.clerkUserId),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditValues(
  action: string,
  req: Request,
  target?: typeof operatorsTable.$inferSelect,
) {
  return {
    action,
    actorClerkUserId: getOperatorActorUserId(req),
    targetOperatorId: target?.id,
    targetEmail: target?.email,
    requestId: req.id == null ? null : String(req.id),
  };
}

router.get("/admin/operators", async (_req, res): Promise<void> => {
  const rows = await db.select().from(operatorsTable)
    .orderBy(
      asc(operatorsTable.status),
      asc(operatorsTable.email),
      asc(operatorsTable.id),
    );
  res.json(GetOperatorsResponse.parse(rows.map(outputOperator)));
});

router.post("/admin/operators/invitations", async (req, res): Promise<void> => {
  const input = CreateOperatorInvitationBody.parse(req.body);
  const userId = getOperatorActorUserId(req);
  const email = input.email.trim().toLowerCase();
  const operator = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.email, email))
      .limit(1);
    if (existing && existing.status !== "removed") {
      throw new ApiError("OPERATOR_ALREADY_EXISTS", "An operator record already exists for this email.", 409);
    }
    const [next] = existing
      ? await tx
          .update(operatorsTable)
          .set({
            status: "invited",
            role: "operator",
            clerkUserId: null,
            invitedBy: userId ?? null,
            approvedBy: null,
            suspendedAt: null,
            removedAt: null,
            authVersion: existing.authVersion + 1,
          })
          .where(
            and(
              eq(operatorsTable.id, existing.id),
              eq(operatorsTable.status, "removed"),
              eq(operatorsTable.authVersion, existing.authVersion),
            ),
          )
          .returning()
      : await tx
          .insert(operatorsTable)
          .values({ email, role: "operator", status: "invited", invitedBy: userId ?? null })
          .onConflictDoNothing({ target: operatorsTable.email })
          .returning();
    if (!next) {
      throw new ApiError(
        "OPERATOR_TRANSITION_CONFLICT",
        "Operator access changed concurrently. Refresh and try again.",
        409,
      );
    }
    await tx.insert(operatorAuditLogsTable).values(auditValues("operator.invited", req, next));
    return next;
  });
  res.status(201).json(CreateOperatorInvitationResponse.parse(outputOperator(operator)));
});

router.post("/admin/operators/:id/approve", async (req, res): Promise<void> => {
  const params = ApproveOperatorParams.parse(req.params);
  const userId = getOperatorActorUserId(req);
  const operator = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.id, params.id))
      .limit(1);
    if (!target) {
      throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
    }
    if (target.status !== "invited" && target.status !== "suspended") {
      throw new ApiError("OPERATOR_STATUS_INVALID", "Only invited or suspended operators can be approved.", 409);
    }
    await runTransitionTestHook("approve", target);
    const [next] = await tx
      .update(operatorsTable)
      .set({
        status: "active",
        approvedBy: userId ?? null,
        suspendedAt: null,
        authVersion: target.authVersion + 1,
      })
      .where(
        and(
          eq(operatorsTable.id, target.id),
          eq(operatorsTable.status, target.status),
          eq(operatorsTable.authVersion, target.authVersion),
        ),
      )
      .returning();
    if (!next) {
      throw new ApiError(
        "OPERATOR_TRANSITION_CONFLICT",
        "Operator access changed concurrently. Refresh and try again.",
        409,
      );
    }
    await tx.insert(operatorAuditLogsTable).values(
      auditValues(
        target.status === "suspended" ? "operator.reactivated" : "operator.approved",
        req,
        next,
      ),
    );
    return next;
  });
  res.json(ApproveOperatorResponse.parse(outputOperator(operator)));
});

router.post("/admin/operators/:id/suspend", async (req, res): Promise<void> => {
  const params = SuspendOperatorParams.parse(req.params);
  const operator = await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.id, params.id))
      .limit(1);
    if (!target) {
      throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
    }
    if (target.role === "owner") {
      throw new ApiError("OWNER_LIFECYCLE_PROTECTED", "Owner accounts cannot be suspended here.", 409);
    }
    if (target.status !== "active") {
      throw new ApiError("OPERATOR_STATUS_INVALID", "Only active operators can be suspended.", 409);
    }
    await runTransitionTestHook("suspend", target);
    const [next] = await tx
      .update(operatorsTable)
      .set({
        status: "suspended",
        suspendedAt: new Date(),
        authVersion: target.authVersion + 1,
      })
      .where(
        and(
          eq(operatorsTable.id, target.id),
          eq(operatorsTable.status, "active"),
          eq(operatorsTable.authVersion, target.authVersion),
        ),
      )
      .returning();
    if (!next) {
      throw new ApiError(
        "OPERATOR_TRANSITION_CONFLICT",
        "Operator access changed concurrently. Refresh and try again.",
        409,
      );
    }
    await tx.insert(operatorAuditLogsTable).values(auditValues("operator.suspended", req, next));
    return next;
  });
  res.json(SuspendOperatorResponse.parse(outputOperator(operator)));
});

router.delete("/admin/operators/:id", async (req, res): Promise<void> => {
  const params = RemoveOperatorParams.parse(req.params);
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.id, params.id))
      .limit(1);
    if (!target) {
      throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
    }
    if (target.role === "owner") {
      throw new ApiError("OWNER_LIFECYCLE_PROTECTED", "Owner accounts cannot be removed here.", 409);
    }
    if (target.status === "removed") {
      throw new ApiError("OPERATOR_STATUS_INVALID", "This operator has already been removed.", 409);
    }
    await runTransitionTestHook("remove", target);
    const [operator] = await tx
      .update(operatorsTable)
      .set({
        status: "removed",
        clerkUserId: null,
        removedAt: new Date(),
        authVersion: target.authVersion + 1,
      })
      .where(
        and(
          eq(operatorsTable.id, target.id),
          eq(operatorsTable.status, target.status),
          eq(operatorsTable.authVersion, target.authVersion),
        ),
      )
      .returning();
    if (!operator) {
      throw new ApiError(
        "OPERATOR_TRANSITION_CONFLICT",
        "Operator access changed concurrently. Refresh and try again.",
        409,
      );
    }
    await tx.insert(operatorAuditLogsTable).values(auditValues("operator.removed", req, operator));
  });
  res.sendStatus(204);
});

router.get("/admin/operator-audit", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(operatorAuditLogsTable)
    .orderBy(desc(operatorAuditLogsTable.createdAt))
    .limit(100);
  res.json(
    GetOperatorAuditLogsResponse.parse(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        targetEmail: row.targetEmail ?? undefined,
        createdAt: row.createdAt.toISOString(),
      })),
    ),
  );
});

export default router;