import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
import {
  GetAdminLandingBackgroundResponse,
  GetLandingBackgroundResponse,
  PublishLandingBackgroundBody,
  PublishLandingBackgroundResponse,
  RequestLandingBackgroundUploadBody,
  RequestLandingBackgroundUploadResponse,
  ServeLandingBackgroundParams,
} from "@workspace/api-zod";
import {
  db,
  landingBackgroundAuditLogsTable,
  landingBackgroundSettingsTable,
  LANDING_BACKGROUND_PRESET_IDS,
  type LandingBackgroundPlacement,
  type LandingBackgroundSetting,
} from "@workspace/db";
import { ApiError } from "../lib/api-error";
import {
  ALLOWED_BACKGROUND_CONTENT_TYPES,
  createLandingBackgroundUpload,
  getVerifiedLandingBackground,
  StoredImageInvalidError,
  StoredObjectNotFoundError,
  verifyStoredLandingBackground,
} from "../lib/object-storage";
import { requireOperator, requireOwner, type OperatorAuthorization } from "../lib/operator-auth";

const router: IRouter = Router();
const CUSTOM_OBJECT_PATH = /^\/objects\/landing-backgrounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_PLACEMENT = { x: 50, y: 50, zoom: 100, opacity: 100, blur: 0 };
const defaultResponsivePlacement = () => ({
  desktop: { ...DEFAULT_PLACEMENT },
  mobile: { ...DEFAULT_PLACEMENT },
});
const DEFAULT_BACKGROUND = {
  mode: "preset" as const,
  presetId: "neon-orbit" as const,
  customObjectPath: null,
  focalX: 50,
  focalY: 50,
  desktopPlacement: { ...DEFAULT_PLACEMENT },
  mobilePlacement: { ...DEFAULT_PLACEMENT },
};

type Placements = Record<string, LandingBackgroundPlacement>;

function isPlacement(value: unknown): value is LandingBackgroundPlacement {
  if (!value || typeof value !== "object") return false;
  const responsive = value as Record<string, unknown>;
  const valid = (placement: unknown) => {
    if (!placement || typeof placement !== "object") return false;
    const { x, y, zoom, opacity, blur } = placement as Record<string, unknown>;
    return typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 100
      && typeof y === "number" && Number.isInteger(y) && y >= 0 && y <= 100
      && typeof zoom === "number" && Number.isInteger(zoom) && zoom >= 100 && zoom <= 150
      && typeof opacity === "number" && Number.isInteger(opacity) && opacity >= 0 && opacity <= 100
      && typeof blur === "number" && Number.isInteger(blur) && blur >= 0 && blur <= 30;
  };
  return valid(responsive.desktop) && valid(responsive.mobile);
}

function normalizeStoredPlacement(value: unknown): LandingBackgroundPlacement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const responsive = value as Record<string, unknown>;
  const normalize = (placement: unknown) => {
    if (!placement || typeof placement !== "object") return undefined;
    const { x, y, zoom, opacity, blur } = placement as Record<string, unknown>;
    if (
      typeof x !== "number" || !Number.isInteger(x) || x < 0 || x > 100
      || typeof y !== "number" || !Number.isInteger(y) || y < 0 || y > 100
      || typeof zoom !== "number" || !Number.isInteger(zoom) || zoom < 100 || zoom > 150
      || (opacity !== undefined && (
        typeof opacity !== "number" || !Number.isInteger(opacity) || opacity < 0 || opacity > 100
      ))
      || (blur !== undefined && (
        typeof blur !== "number" || !Number.isInteger(blur) || blur < 0 || blur > 30
      ))
    ) return undefined;
    return { x, y, zoom, opacity: opacity ?? 100, blur: blur ?? 0 };
  };
  const desktop = normalize(responsive.desktop);
  const mobile = normalize(responsive.mobile);
  return desktop && mobile ? { desktop, mobile } : undefined;
}

function isKnownPlacementKey(key: string): boolean {
  return (LANDING_BACKGROUND_PRESET_IDS as readonly string[]).includes(key) || CUSTOM_OBJECT_PATH.test(key);
}

function normalizedPlacements(row: LandingBackgroundSetting | undefined): Placements {
  const placements: Placements = Object.fromEntries(
    LANDING_BACKGROUND_PRESET_IDS.map((presetId) => [presetId, defaultResponsivePlacement()]),
  );
  if (!row) return placements;
  const activeKey = row.mode === "custom" ? row.customObjectPath : row.presetId;
  let hasActivePlacement = false;
  const storedEntries = Object.entries(row.placements ?? {}).flatMap(([key, placement]) => {
    const normalized = normalizeStoredPlacement(placement);
    return isKnownPlacementKey(key) && normalized ? [[key, normalized] as const] : [];
  });
  const customEntries = storedEntries.filter(([key]) => !(LANDING_BACKGROUND_PRESET_IDS as readonly string[]).includes(key));
  const permittedCustomKeys = new Set(customEntries.slice(0, 90).map(([key]) => key));
  if (activeKey && CUSTOM_OBJECT_PATH.test(activeKey)) {
    permittedCustomKeys.add(activeKey);
    if (permittedCustomKeys.size > 90) permittedCustomKeys.delete(customEntries[89]?.[0] ?? "");
  }
  for (const [key, placement] of storedEntries) {
    if (CUSTOM_OBJECT_PATH.test(key) && !permittedCustomKeys.has(key)) continue;
    placements[key] = placement;
    if (key === activeKey) hasActivePlacement = true;
  }
  if (activeKey && !hasActivePlacement) {
    placements[activeKey] = {
      desktop: { x: row.focalX, y: row.focalY, zoom: 100, opacity: 100, blur: 0 },
      mobile: { x: row.focalX, y: row.focalY, zoom: 100, opacity: 100, blur: 0 },
    };
  }
  return placements;
}

function activePlacement(row: LandingBackgroundSetting | undefined, placements: Placements) {
  if (!row) return defaultResponsivePlacement();
  const activeKey = row.mode === "custom" ? row.customObjectPath : row.presetId;
  return activeKey && placements[activeKey] ? placements[activeKey] : defaultResponsivePlacement();
}

function publicSelection(row: LandingBackgroundSetting | undefined) {
  if (!row) return DEFAULT_BACKGROUND;
  const placements = normalizedPlacements(row);
  const active = activePlacement(row, placements);
  return {
    mode: row.mode as "preset" | "custom",
    presetId: row.presetId as typeof DEFAULT_BACKGROUND.presetId | null,
    customObjectPath: row.customObjectPath,
    focalX: active.desktop.x,
    focalY: active.desktop.y,
    desktopPlacement: active.desktop,
    mobilePlacement: active.mobile,
  };
}

function validatePlacementInput(placements: Placements, activeKey: string): Placements {
  const entries = Object.entries(placements);
  if (entries.length > 100 || entries.some(([key, placement]) => !isKnownPlacementKey(key) || !isPlacement(placement))) {
    throw new ApiError("LANDING_BACKGROUND_PLACEMENTS_INVALID", "Placements must contain at most 100 known images with valid responsive placement values.", 400);
  }
  if (!Object.prototype.hasOwnProperty.call(placements, activeKey)) {
    throw new ApiError("LANDING_BACKGROUND_ACTIVE_PLACEMENT_MISSING", "Placements must include the active background source.", 400);
  }
  return placements;
}

function validateMergedPlacements(placements: Placements, activeKey: string): Placements {
  if (Object.keys(placements).length > 100) {
    throw new ApiError("LANDING_BACKGROUND_PLACEMENTS_INVALID", "Placements must contain at most 100 known images with valid responsive placement values.", 400);
  }
  if (!Object.prototype.hasOwnProperty.call(placements, activeKey)) {
    throw new ApiError("LANDING_BACKGROUND_ACTIVE_PLACEMENT_MISSING", "Placements must include the active background source.", 400);
  }
  return placements;
}

async function currentSetting(): Promise<LandingBackgroundSetting | undefined> {
  const [row] = await db.select().from(landingBackgroundSettingsTable)
    .orderBy(desc(landingBackgroundSettingsTable.version))
    .limit(1);
  return row;
}

router.get("/landing-background", async (_req, res, next) => {
  try {
    res.json(GetLandingBackgroundResponse.parse(publicSelection(await currentSetting())));
  } catch (error) {
    next(error);
  }
});

router.get("/storage/objects/landing-backgrounds/:id", async (req, res, next) => {
  try {
    const { id } = ServeLandingBackgroundParams.parse(req.params);
    const image = await getVerifiedLandingBackground(`/objects/landing-backgrounds/${id}`);
    if (!ALLOWED_BACKGROUND_CONTENT_TYPES.includes(image.contentType as typeof ALLOWED_BACKGROUND_CONTENT_TYPES[number])) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    res.setHeader("content-type", image.contentType);
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("content-security-policy", "default-src 'none'; sandbox");
    res.send(image.buffer);
  } catch (error) {
    if (error instanceof StoredObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (error instanceof StoredImageInvalidError) {
      res.status(415).json({ error: "Stored object is not an allowed image" });
      return;
    }
    next(error);
  }
});

router.get("/admin/landing-background", requireOperator, async (_req, res, next) => {
  try {
    const row = await currentSetting();
    const output = row
      ? { ...publicSelection(row), placements: normalizedPlacements(row), version: row.version, createdAt: row.createdAt, createdBy: row.createdBy }
      : { ...DEFAULT_BACKGROUND, placements: normalizedPlacements(undefined), version: 0, createdAt: new Date(0), createdBy: "system" };
    res.json(GetAdminLandingBackgroundResponse.parse(output));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/landing-background", requireOwner, async (req, res, next) => {
  try {
    const input = PublishLandingBackgroundBody.parse(req.body);
    const operator = res.locals.operator as OperatorAuthorization;
    const activeKey = input.mode === "custom" ? input.customObjectPath : input.presetId;
    const inputPlacements = validatePlacementInput(input.placements, activeKey);
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(2026083080)`);
      if (input.mode === "custom") {
        try {
          await verifyStoredLandingBackground(input.customObjectPath);
        } catch {
          throw new ApiError(
            "LANDING_BACKGROUND_OBJECT_INVALID",
            "Custom background must be a stored PNG, JPEG, or WebP image no larger than 10 MB.",
            400,
          );
        }
      }
      const [latest] = await tx.select()
        .from(landingBackgroundSettingsTable)
        .orderBy(desc(landingBackgroundSettingsTable.version))
        .limit(1);
      const placements = validateMergedPlacements({
        ...normalizedPlacements(latest),
        ...inputPlacements,
      }, activeKey);
      const active = placements[activeKey]!;
      const [row] = await tx.insert(landingBackgroundSettingsTable).values({
        version: (latest?.version ?? 0) + 1,
        mode: input.mode,
        presetId: input.mode === "preset" ? input.presetId : null,
        customObjectPath: input.mode === "custom" ? input.customObjectPath : null,
        focalX: active.desktop.x,
        focalY: active.desktop.y,
        placements,
        createdBy: operator.id,
      }).returning();
      await tx.insert(landingBackgroundAuditLogsTable).values({
        actorId: operator.id,
        settingId: row.id,
        version: row.version,
        details: {
          mode: row.mode,
          presetId: row.presetId,
          customObjectPath: row.customObjectPath,
          focalX: row.focalX,
          focalY: row.focalY,
          placements: row.placements,
        },
      });
      return row;
    });
    res.status(201).json(PublishLandingBackgroundResponse.parse({
      ...publicSelection(created),
      placements: normalizedPlacements(created),
      version: created.version,
      createdAt: created.createdAt,
      createdBy: created.createdBy,
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/admin/landing-background/upload", requireOwner, async (req, res, next) => {
  try {
    const input = RequestLandingBackgroundUploadBody.parse(req.body);
    const upload = await createLandingBackgroundUpload(input.contentType);
    res.json(RequestLandingBackgroundUploadResponse.parse(upload));
  } catch (error) {
    next(error);
  }
});

export default router;