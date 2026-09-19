import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkspaceConfigSnapshot,
  validateSnapshotReferences,
  type WorkspaceConfigSnapshot,
} from "../src/lib/workspace-config-sync-helpers";

function snapshot(): WorkspaceConfigSnapshot {
  return {
    schemaVersion: 1,
    source: { environment: "development", exportedAt: "2026-09-19T00:00:00.000Z" },
    objects: [{
      path: "/objects/social-trust-icons/551a497c-8359-4e33-8819-5cc09e457859",
      contentType: "image/png",
      sha256: "0".repeat(64),
      base64: "AA==",
    }],
    cryptoAssets: [],
    cryptoNetworks: [],
    fiatCurrencies: [],
    paymentMethods: [],
    fiatCurrencyPaymentMethods: [],
    manualDeskPricingRules: [],
    site: { publishedPages: [], publication: null },
    landingBackground: null,
  };
}

test("accepts a development snapshot with a bounded object bundle", () => {
  const parsed = parseWorkspaceConfigSnapshot(snapshot());
  assert.equal(parsed.objects?.length, 1);
  assert.deepEqual(validateSnapshotReferences(parsed), []);
});

test("rejects duplicate bundled object paths", () => {
  const input = snapshot();
  input.objects = [input.objects![0]!, input.objects![0]!];
  assert.throws(
    () => parseWorkspaceConfigSnapshot(input),
    /Duplicate bundled object/,
  );
});

test("rejects malformed bundled object hashes", () => {
  const input = snapshot();
  input.objects![0]!.sha256 = "not-a-sha256";
  assert.throws(
    () => parseWorkspaceConfigSnapshot(input),
    /Invalid bundled configuration object/,
  );
});