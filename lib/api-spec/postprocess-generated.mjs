import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(directory, "..", "api-zod", "src", "index.ts");
await writeFile(
  indexPath,
  [
    'export * from "./generated/api";',
    'export { PublishLandingBackgroundBody } from "./landing-background";',
    'export * as ApiTypes from "./generated/types";',
    "",
  ].join("\n"),
);

const generatedPaths = [
  path.resolve(directory, "..", "api-client-react", "src", "generated", "api.schemas.ts"),
  path.resolve(directory, "..", "api-client-react", "src", "generated", "api.ts"),
  path.resolve(directory, "..", "api-zod", "src", "generated", "api.ts"),
  path.resolve(directory, "..", "api-zod", "src", "generated", "types", "index.ts"),
];

await Promise.all(generatedPaths.map(async (generatedPath) => {
  const content = await readFile(generatedPath, "utf8");
  // Orval's current zod emitter uses the Zod 4 top-level helpers for
  // formats/integers, while this workspace intentionally stays on Zod 3.
  // Normalize those helpers so generated contracts remain executable.
  const compatible = content
    .replaceAll("zod.uuid()", "zod.string().uuid()")
    .replaceAll("zod.url()", "zod.string().url()")
    .replaceAll("zod.int()", "zod.number().int()");
  await writeFile(generatedPath, `${compatible.trimEnd()}\n`);
}));