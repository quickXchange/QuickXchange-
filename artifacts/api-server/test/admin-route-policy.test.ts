import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { classifyAdminRoute } from "../src/lib/admin-policy";

test("every statically declared Admin route has a deny-by-default policy", async () => {
  const routesDirectory = join(process.cwd(), "src/routes");
  const routeFiles = (await readdir(routesDirectory)).filter((file) =>
    file.endsWith(".ts"),
  );
  const missing: string[] = [];
  for (const file of routeFiles) {
    const source = await readFile(join(routesDirectory, file), "utf8");
    const matcher =
      /router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(matcher)) {
      const method = match[1]?.toUpperCase();
      const path = match[2];
      if (!method || !path || !path.startsWith("/admin")) continue;
      if (!classifyAdminRoute(method, path)) {
        missing.push(`${file}: ${method} ${path}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Unclassified Admin routes:\n${missing.join("\n")}`);
});

test("WhiteBIT integration routes use the intended permission boundaries", () => {
  assert.deepEqual(
    classifyAdminRoute("GET", "/admin/providers/whitebit"),
    { permission: "integrations.view", ownerOnly: false },
  );
  assert.deepEqual(
    classifyAdminRoute("GET", "/admin/providers/whitebit/credentials"),
    { permission: "integrations.view", ownerOnly: false },
  );
  assert.deepEqual(
    classifyAdminRoute("PUT", "/admin/providers/whitebit/credentials"),
    { permission: "integrations.credentials.update", ownerOnly: true },
  );
  assert.deepEqual(
    classifyAdminRoute("POST", "/admin/providers/whitebit/credentials/test"),
    { permission: "integrations.credentials.test", ownerOnly: true },
  );
  assert.deepEqual(
    classifyAdminRoute("PATCH", "/admin/providers/whitebit"),
    { permission: "integrations.credentials.update", ownerOnly: true },
  );
});
