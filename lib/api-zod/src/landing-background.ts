import { z as zod } from "zod";

const presetIds = [
  "neon-orbit",
  "crystal-ledger",
  "quantum-grid",
  "liquid-token",
  "aurora-chain",
  "prism-vault",
  "network-bloom",
  "electric-canyon",
  "cosmic-exchange",
  "blueprint-future",
] as const;

const customObjectPath = zod.string().regex(
  /^\/objects\/landing-backgrounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
);
const placementKey = zod.union([zod.enum(presetIds), customObjectPath]);
const axis = zod.number().int().min(0).max(100);
const placement = zod.object({
  x: axis,
  y: axis,
  zoom: zod.number().int().min(100).max(150),
  opacity: axis,
  blur: zod.number().int().min(0).max(30),
}).strict();
const responsivePlacement = zod.object({
  desktop: placement,
  mobile: placement,
}).strict();
const placements = zod.record(placementKey, responsivePlacement)
  .refine((value) => Object.keys(value).length <= 100, {
    message: "Placements must contain at most 100 entries.",
  });

const legacyAxis = axis.optional();

const presetPublish = zod.object({
  mode: zod.literal("preset"),
  presetId: zod.enum(presetIds),
  focalX: legacyAxis,
  focalY: legacyAxis,
  placements,
}).strict().superRefine((value, context) => {
  if (!Object.prototype.hasOwnProperty.call(value.placements, value.presetId)) {
    context.addIssue({
      code: "custom",
      path: ["placements"],
      message: "Placements must include the active background source.",
    });
  }
});

const customPublish = zod.object({
  mode: zod.literal("custom"),
  customObjectPath,
  focalX: legacyAxis,
  focalY: legacyAxis,
  placements,
}).strict().superRefine((value, context) => {
  if (!Object.prototype.hasOwnProperty.call(value.placements, value.customObjectPath)) {
    context.addIssue({
      code: "custom",
      path: ["placements"],
      message: "Placements must include the active background source.",
    });
  }
});

/**
 * Orval currently omits OpenAPI `propertyNames`, `maxProperties`, and nested
 * `additionalProperties: false` constraints from generated Zod records.
 * Keep the package's exported request parser faithful to the HTTP contract.
 */
export const PublishLandingBackgroundBody = zod.union([presetPublish, customPublish]);