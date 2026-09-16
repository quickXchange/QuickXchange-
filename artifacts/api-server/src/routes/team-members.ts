import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  lt,
  or,
} from "drizzle-orm";
import {
  adminActivityEventsTable,
  db,
  operatorsTable,
  teamRolesTable,
} from "@workspace/db";
import {
  CreateTeamRoleBody,
  CreateTeamRoleResponse,
  DeleteTeamRoleParams,
  GetCurrentAdminAuthorizationResponse,
  InviteTeamMemberBody,
  InviteTeamMemberResponse,
  ListAdminActivityQueryParams,
  ListAdminActivityResponse,
  ListTeamMembersResponse,
  ListTeamRolesResponse,
  ReactivateTeamMemberParams,
  ReactivateTeamMemberResponse,
  RemoveTeamMemberParams,
  SuspendTeamMemberParams,
  SuspendTeamMemberResponse,
  UpdateTeamMemberBody,
  UpdateTeamMemberParams,
  UpdateTeamMemberResponse,
  UpdateTeamRoleBody,
  UpdateTeamRoleParams,
  UpdateTeamRoleResponse,
} from "@workspace/api-zod";
import { ApiError } from "../lib/api-error";
import {
  getOperatorActorUserId,
  getOperatorAuthorization,
  getOperatorAuthorizationForRecord,
  requireOwner,
  requireOperator,
  type OperatorAuthorization,
} from "../lib/operator-auth";
import {
  OWNER_ONLY_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  isPermissionKey,
  validatePermissionKeys,
} from "../lib/permissions";

const router: IRouter = Router();

function normalizeRoleName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function permissionInput(values: readonly string[] | undefined): string[] {
  try {
    const keys = validatePermissionKeys(values ?? []);
    if (keys.some((key) => OWNER_ONLY_PERMISSION_KEYS.has(key))) {
      throw new ApiError(
        "OWNER_ONLY_PERMISSION",
        "Owner-only permissions cannot be assigned to a staff role or override.",
        403,
      );
    }
    return keys;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("INVALID_PERMISSION_KEY", "Unknown permission key.", 400);
  }
}

async function effectivePermissionsFor(
  operator: typeof operatorsTable.$inferSelect,
): Promise<string[]> {
  const authorization = await getOperatorAuthorizationForRecord(operator);
  return authorization?.effectivePermissions ?? [];
}

async function outputMember(
  operator: typeof operatorsTable.$inferSelect,
): Promise<Record<string, unknown>> {
  return {
    id: operator.id,
    email: operator.email,
    name: operator.name,
    role: operator.role,
    status: operator.status,
    customRoleId: operator.customRoleId,
    permissionAllows: operator.permissionAllows.filter(isPermissionKey),
    permissionDenies: operator.permissionDenies.filter(isPermissionKey),
    effectivePermissions: await effectivePermissionsFor(operator),
    linkedToClerk: Boolean(operator.clerkUserId),
    authVersion: operator.authVersion,
    createdAt: operator.createdAt.toISOString(),
    updatedAt: operator.updatedAt.toISOString(),
  };
}

async function roleOutput(role: typeof teamRolesTable.$inferSelect) {
  const [{ usageCount }] = await db
    .select({ usageCount: count(operatorsTable.id) })
    .from(operatorsTable)
    .where(eq(operatorsTable.customRoleId, role.id));
  return {
    id: role.id,
    name: role.name,
    normalizedName: role.normalizedName,
    description: role.description,
    permissionKeys: role.permissionKeys.filter(isPermissionKey),
    usageCount: Number(usageCount),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
  };
}

function assertNotSelf(actor: OperatorAuthorization, targetId: string): void {
  if (actor.id === targetId) {
    throw new ApiError(
      "SELF_MEMBER_MUTATION_BLOCKED",
      "Members cannot modify their own access or lifecycle.",
      403,
    );
  }
}

router.get("/admin/authorization", requireOperator, async (req, res): Promise<void> => {
  const actor = res.locals.operator as OperatorAuthorization;
  const [operator] = await db
    .select()
    .from(operatorsTable)
    .where(eq(operatorsTable.id, actor.id))
    .limit(1);
  if (!operator) throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
  const member = await outputMember(operator);
  res.json(
    GetCurrentAdminAuthorizationResponse.parse({
      member,
      owner: actor.role === "owner",
      effectivePermissions: actor.effectivePermissions,
      catalog: PERMISSION_CATALOG.map((permission) => ({
        key: permission.key,
        section: permission.section,
        label: permission.label,
        ownerOnly: "ownerOnly" in permission && permission.ownerOnly === true,
      })),
    }),
  );
});

router.get("/admin/team-members", requireOperator, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(operatorsTable)
    .orderBy(asc(operatorsTable.status), asc(operatorsTable.email), asc(operatorsTable.id));
  res.json(ListTeamMembersResponse.parse(await Promise.all(rows.map(outputMember))));
});

router.post("/admin/team-members", requireOwner, async (req, res): Promise<void> => {
  const input = InviteTeamMemberBody.parse(req.body);
  const email = input.email.trim().toLowerCase();
  const allows = permissionInput(input.permissionAllows);
  const denies = permissionInput(input.permissionDenies);
  if (input.customRoleId) {
    const [role] = await db.select({ id: teamRolesTable.id }).from(teamRolesTable)
      .where(eq(teamRolesTable.id, input.customRoleId)).limit(1);
    if (!role) throw new ApiError("TEAM_ROLE_NOT_FOUND", "Reusable role not found.", 404);
  }
  const [existing] = await db.select().from(operatorsTable)
    .where(eq(operatorsTable.email, email)).limit(1);
  if (existing && existing.status !== "removed") {
    throw new ApiError("OPERATOR_ALREADY_EXISTS", "An operator record already exists for this email.", 409);
  }
  const member = existing
    ? (await db.update(operatorsTable).set({
        name: input.name.trim(),
        status: "invited",
        role: "operator",
        customRoleId: input.customRoleId ?? null,
        permissionAllows: allows,
        permissionDenies: denies,
        clerkUserId: null,
        invitedBy: getOperatorActorUserId(req),
        approvedBy: null,
        suspendedAt: null,
        removedAt: null,
        authVersion: existing.authVersion + 1,
      }).where(and(eq(operatorsTable.id, existing.id), eq(operatorsTable.status, "removed"),
        eq(operatorsTable.authVersion, existing.authVersion))).returning())[0]
    : (await db.insert(operatorsTable).values({
        name: input.name.trim(),
        email,
        role: "operator",
        status: "invited",
        customRoleId: input.customRoleId ?? null,
        permissionAllows: allows,
        permissionDenies: denies,
        invitedBy: getOperatorActorUserId(req),
      }).returning())[0];
  if (!member) throw new ApiError("OPERATOR_TRANSITION_CONFLICT", "Operator changed concurrently.", 409);
  res.status(201).json(InviteTeamMemberResponse.parse(await outputMember(member)));
});

router.patch("/admin/team-members/:id", requireOwner, async (req, res): Promise<void> => {
  const { id } = UpdateTeamMemberParams.parse(req.params);
  const input = UpdateTeamMemberBody.parse(req.body);
  const actor = res.locals.operator as OperatorAuthorization;
  assertNotSelf(actor, id);
  const [target] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, id)).limit(1);
  if (!target) throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
  if (target.role === "owner") throw new ApiError("OWNER_LIFECYCLE_PROTECTED", "Owner accounts cannot be changed here.", 409);
  const allows = input.permissionAllows === undefined ? target.permissionAllows : permissionInput(input.permissionAllows);
  const denies = input.permissionDenies === undefined ? target.permissionDenies : permissionInput(input.permissionDenies);
  if (input.customRoleId) {
    const [role] = await db.select({ id: teamRolesTable.id }).from(teamRolesTable)
      .where(eq(teamRolesTable.id, input.customRoleId)).limit(1);
    if (!role) throw new ApiError("TEAM_ROLE_NOT_FOUND", "Reusable role not found.", 404);
  }
  const [next] = await db.update(operatorsTable).set({
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.status === undefined
      ? {}
      : { suspendedAt: input.status === "suspended" ? new Date() : null }),
    ...(input.customRoleId === undefined ? {} : { customRoleId: input.customRoleId }),
    ...(input.permissionAllows === undefined ? {} : { permissionAllows: allows }),
    ...(input.permissionDenies === undefined ? {} : { permissionDenies: denies }),
    authVersion: target.authVersion + 1,
  }).where(and(eq(operatorsTable.id, id), eq(operatorsTable.authVersion, input.expectedAuthVersion),
    eq(operatorsTable.role, "operator"))).returning();
  if (!next) throw new ApiError("OPERATOR_TRANSITION_CONFLICT", "Operator changed concurrently. Refresh and try again.", 409);
  res.json(UpdateTeamMemberResponse.parse(await outputMember(next)));
});

async function transitionMember(
  req: Request,
  res: Response,
  status: "suspended" | "active",
): Promise<void> {
  const params = (status === "suspended" ? SuspendTeamMemberParams : ReactivateTeamMemberParams).parse(req.params);
  const actor = res.locals.operator as OperatorAuthorization;
  assertNotSelf(actor, params.id);
  const [target] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, params.id)).limit(1);
  if (!target) throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
  if (target.role === "owner") throw new ApiError("OWNER_LIFECYCLE_PROTECTED", "Owner accounts cannot be changed here.", 409);
  const [next] = await db.update(operatorsTable).set({
    status,
    suspendedAt: status === "suspended" ? new Date() : null,
    authVersion: target.authVersion + 1,
  }).where(and(eq(operatorsTable.id, target.id), eq(operatorsTable.status, status === "suspended" ? "active" : "suspended"),
    eq(operatorsTable.authVersion, target.authVersion))).returning();
  if (!next) throw new ApiError("OPERATOR_TRANSITION_CONFLICT", "Operator changed concurrently. Refresh and try again.", 409);
  const schema = status === "suspended" ? SuspendTeamMemberResponse : ReactivateTeamMemberResponse;
  res.json(schema.parse(await outputMember(next)));
}

router.post("/admin/team-members/:id/suspend", requireOwner, async (req, res): Promise<void> => {
  await transitionMember(req, res, "suspended");
});
router.post("/admin/team-members/:id/reactivate", requireOwner, async (req, res): Promise<void> => {
  await transitionMember(req, res, "active");
});

router.delete("/admin/team-members/:id", requireOwner, async (req, res): Promise<void> => {
  const { id } = RemoveTeamMemberParams.parse(req.params);
  const actor = res.locals.operator as OperatorAuthorization;
  assertNotSelf(actor, id);
  const [target] = await db.select().from(operatorsTable).where(eq(operatorsTable.id, id)).limit(1);
  if (!target) throw new ApiError("OPERATOR_NOT_FOUND", "Operator record not found.", 404);
  if (target.role === "owner") throw new ApiError("OWNER_LIFECYCLE_PROTECTED", "Owner accounts cannot be removed here.", 409);
  const [removed] = await db.update(operatorsTable).set({
    status: "removed", clerkUserId: null, removedAt: new Date(), authVersion: target.authVersion + 1,
  }).where(and(eq(operatorsTable.id, id), eq(operatorsTable.authVersion, target.authVersion),
    eq(operatorsTable.role, "operator"))).returning();
  if (!removed) throw new ApiError("OPERATOR_TRANSITION_CONFLICT", "Operator changed concurrently. Refresh and try again.", 409);
  res.sendStatus(204);
});

router.get("/admin/team-roles", requireOperator, async (_req, res): Promise<void> => {
  const rows = await db.select().from(teamRolesTable).orderBy(asc(teamRolesTable.normalizedName));
  res.json(ListTeamRolesResponse.parse(await Promise.all(rows.map(roleOutput))));
});

router.post("/admin/team-roles", requireOwner, async (req, res): Promise<void> => {
  const input = CreateTeamRoleBody.parse(req.body);
  const permissions = permissionInput(input.permissionKeys);
  const [role] = await db.insert(teamRolesTable).values({
    name: input.name.trim(), normalizedName: normalizeRoleName(input.name),
    description: input.description.trim(), permissionKeys: permissions,
  }).onConflictDoNothing({ target: teamRolesTable.normalizedName }).returning();
  if (!role) throw new ApiError("TEAM_ROLE_NAME_EXISTS", "A role with that name already exists.", 409);
  res.status(201).json(CreateTeamRoleResponse.parse(await roleOutput(role)));
});

router.patch("/admin/team-roles/:id", requireOwner, async (req, res): Promise<void> => {
  const { id } = UpdateTeamRoleParams.parse(req.params);
  const input = UpdateTeamRoleBody.parse(req.body);
  const [role] = await db.select().from(teamRolesTable).where(eq(teamRolesTable.id, id)).limit(1);
  if (!role) throw new ApiError("TEAM_ROLE_NOT_FOUND", "Reusable role not found.", 404);
  const permissions = permissionInput(input.permissionKeys);
  let next: typeof role | undefined;
  try {
    [next] = await db.update(teamRolesTable).set({
      name: input.name.trim(), normalizedName: normalizeRoleName(input.name),
      description: input.description.trim(), permissionKeys: permissions,
    }).where(eq(teamRolesTable.id, id)).returning();
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError("TEAM_ROLE_NAME_EXISTS", "A role with that name already exists.", 409);
    }
    throw error;
  }
  if (!next) throw new ApiError("TEAM_ROLE_NOT_FOUND", "Reusable role not found.", 404);
  res.json(UpdateTeamRoleResponse.parse(await roleOutput(next)));
});

router.delete("/admin/team-roles/:id", requireOwner, async (req, res): Promise<void> => {
  const { id } = DeleteTeamRoleParams.parse(req.params);
  const [role] = await db.select().from(teamRolesTable).where(eq(teamRolesTable.id, id)).limit(1);
  if (!role) throw new ApiError("TEAM_ROLE_NOT_FOUND", "Reusable role not found.", 404);
  if (role.normalizedName === "legacy-operator") throw new ApiError("TEAM_ROLE_PROTECTED", "The Legacy Operator role cannot be deleted.", 409);
  const [{ usageCount }] = await db.select({ usageCount: count(operatorsTable.id) }).from(operatorsTable)
    .where(eq(operatorsTable.customRoleId, id));
  if (Number(usageCount) > 0) throw new ApiError("TEAM_ROLE_IN_USE", "Reassign members before deleting this role.", 409);
  await db.delete(teamRolesTable).where(eq(teamRolesTable.id, id));
  res.sendStatus(204);
});

function decodeCursor(cursor: string | undefined): { occurredAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const [date, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const occurredAt = new Date(date);
    if (!id || Number.isNaN(occurredAt.valueOf())) throw new Error("invalid");
    return { occurredAt, id };
  } catch {
    throw new ApiError("INVALID_ACTIVITY_CURSOR", "The activity cursor is invalid.", 400);
  }
}

router.get("/admin/activity", requireOperator, async (req, res): Promise<void> => {
  const query = ListAdminActivityQueryParams.parse(req.query);
  if (query.permissionKey && !isPermissionKey(query.permissionKey)) {
    throw new ApiError("INVALID_PERMISSION_KEY", "Unknown permission key.", 400);
  }
  const cursor = decodeCursor(query.cursor);
  const conditions = [
    query.section ? eq(adminActivityEventsTable.section, query.section) : undefined,
    query.permissionKey ? eq(adminActivityEventsTable.permissionKey, query.permissionKey) : undefined,
    cursor ? or(
      lt(adminActivityEventsTable.occurredAt, cursor.occurredAt),
      and(eq(adminActivityEventsTable.occurredAt, cursor.occurredAt), lt(adminActivityEventsTable.id, cursor.id)),
    ) : undefined,
  ];
  const rows = await db.select().from(adminActivityEventsTable)
    .where(and(...conditions)).orderBy(desc(adminActivityEventsTable.occurredAt), desc(adminActivityEventsTable.id))
    .limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? Buffer.from(`${last.occurredAt.toISOString()}|${last.id}`).toString("base64url")
    : null;
  res.json(ListAdminActivityResponse.parse({
    items: page.map((row) => ({
      id: row.id,
      member: row.actorMemberName || row.actorMemberEmail,
      action: row.action,
      section: row.section,
      entityKind: row.entityKind,
      entityId: row.entityId,
      safeLabel: row.safeLabel,
      occurredAt: row.occurredAt.toISOString(),
      outcome: row.outcome,
    })),
    nextCursor,
  }));
});

export default router;