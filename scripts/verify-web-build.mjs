import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const artifactDir = path.resolve(process.argv[2] || ".");
const publicDir = path.join(artifactDir, "dist", "public");
const indexPath = path.join(publicDir, "index.html");
const configuredBasePath = process.env.BASE_PATH?.trim();
const basePath = configuredBasePath
  ? `/${configuredBasePath.replace(/^\/+|\/+$/g, "")}/`
  : "/telegram-mini-app/";

async function requireFile(filePath) {
  await access(filePath);
  const details = await stat(filePath);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Build output is missing or empty: ${filePath}`);
  }
  return details;
}

const indexDetails = await requireFile(indexPath);
const html = await readFile(indexPath, "utf8");
const references = [...html.matchAll(/(?:src|href)=["']([^"'?#]+)(?:[?#][^"']*)?["']/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|data:|mailto:|#)/.test(reference));

for (const reference of references) {
  const relativePath = (
    reference.startsWith(basePath)
      ? reference.slice(basePath.length)
      : reference
  ).replace(/^\/+/, "");
  if (!relativePath) continue;
  await requireFile(path.join(publicDir, relativePath));
}

const metadata = {
  buildId: process.env.APP_BUILD_ID || null,
  commit: process.env.APP_COMMIT || process.env.REPLIT_GIT_COMMIT || null,
  deployedAt: process.env.DEPLOYED_AT || new Date(indexDetails.mtimeMs).toISOString(),
  verifiedAt: new Date().toISOString(),
};

await writeFile(
  path.join(publicDir, "build-manifest.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

console.log(`Verified fresh web output in ${publicDir}`);