import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_getVarsForDev, unstable_readConfig } from "wrangler";
import { describe, expect, it } from "vitest";
import fixture from "../../../test-fixtures/embedding-contract.json";
import { resolveEmbeddingConfig } from "../src/lib/embedding-contract";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));

describe.each([undefined, "production"])("Wrangler embedding settings (%s)", (environment) => {
  it.each(fixture.configCases)("resolves merged overrides $env", (testCase) => {
    const config = unstable_readConfig({ config: configPath, env: environment });
    const directory = mkdtempSync(join(tmpdir(), "videoq-embedding-settings-"));
    try {
      // Load a disposable file so the developer's .dev.vars and credentials
      // never influence this configuration integration test.
      writeFileSync(join(directory, ".dev.vars"), Object.entries(testCase.env)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n"));
      const bindings = unstable_getVarsForDev(
        join(directory, "wrangler.jsonc"), undefined, config.vars, environment, true,
      );
      const settings = {
        EMBEDDING_PROVIDER: String(bindings.EMBEDDING_PROVIDER?.value ?? ""),
        EMBEDDING_MODEL: String(bindings.EMBEDDING_MODEL?.value ?? ""),
      };
      if (testCase.error) {
        expect(() => resolveEmbeddingConfig(settings))
          .toThrowError(expect.objectContaining({ reason: testCase.error }));
      } else {
        expect(resolveEmbeddingConfig(settings)).toEqual(testCase.expected);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
