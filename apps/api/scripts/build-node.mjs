import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

await build({
  entryPoints: { node: "src/runtime/node.ts", "migrate-database": "scripts/migrate-database.ts" },
  outdir: "dist", outExtension: { ".js": ".mjs" },
  bundle: true, platform: "node", target: "node22", format: "esm",
  // Workspace sources must be bundled; production dependencies stay external.
  external: Object.keys(pkg.dependencies).filter(name => name !== "@videoq/trpc"),
});
