import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./test/workers/worker.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["test/workers/**/*.test.ts"],
    // workerd cannot read Vitest's transformed modules from the host filesystem.
    fsModuleCache: false,
  },
});
