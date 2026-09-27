import { eq } from "drizzle-orm";
import {
  convertDefaultPairSettingsTable,
  db,
} from "@workspace/db";

export type QuickexConvertDefaultPair = {
  fromAsset: string;
  fromNetwork: string;
  toAsset: string;
  toNetwork: string;
};

export async function getPersistedQuickexConvertDefaultPair(): Promise<QuickexConvertDefaultPair | null> {
  const [row] = await db.select().from(convertDefaultPairSettingsTable)
    .where(eq(convertDefaultPairSettingsTable.id, "global"))
    .limit(1);
  return row ? {
    fromAsset: row.fromAsset,
    fromNetwork: row.fromNetwork,
    toAsset: row.toAsset,
    toNetwork: row.toNetwork,
  } : null;
}

export async function savePersistedQuickexConvertDefaultPair(
  pair: QuickexConvertDefaultPair,
): Promise<QuickexConvertDefaultPair> {
  await db.insert(convertDefaultPairSettingsTable)
    .values({ id: "global", ...pair })
    .onConflictDoUpdate({
      target: convertDefaultPairSettingsTable.id,
      set: pair,
    });
  return pair;
}

export async function getEffectiveQuickexConvertDefaultPair(
  availablePairs: readonly QuickexConvertDefaultPair[],
): Promise<QuickexConvertDefaultPair | undefined> {
  if (!availablePairs.length) return undefined;
  const saved = await getPersistedQuickexConvertDefaultPair();
  if (saved && availablePairs.some((pair) =>
    pair.fromAsset === saved.fromAsset &&
    pair.fromNetwork === saved.fromNetwork &&
    pair.toAsset === saved.toAsset &&
    pair.toNetwork === saved.toNetwork
  )) {
    return saved;
  }
  return availablePairs[0];
}