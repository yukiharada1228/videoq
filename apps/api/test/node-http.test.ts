import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";

const created = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("undici", async importOriginal => {
  const actual = await importOriginal<typeof import("undici")>();
  return { ...actual, Agent: class extends actual.Agent {
    constructor(options: ConstructorParameters<typeof actual.Agent>[0]) {
      super(options);
      created.push(options as Record<string, unknown>);
    }
  } };
});
import { nodeHttpAgent } from "../src/runtime/node-http";

afterEach(() => { created.length = 0; });

describe("Node inference HTTP transport", () => {
  it.each([
    [120_000, 300_000, 300_000],
    [600_000, 300_000, 600_000],
    [120_000, 900_000, 900_000],
  ])("supports request %i and stream %i deadlines", async (request, stream, expected) => {
    const agent = nodeHttpAgent(request, stream);
    try {
      expect(created.at(-1)).toMatchObject({ headersTimeout: expected, bodyTimeout: expected });
    } finally { await agent.close(); }
  });

  it("applies to native fetch while preserving caller cancellation", async () => {
    const server = createServer((_, response) => {
      setTimeout(() => response.end("local answer"), 1500);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const original = getGlobalDispatcher();
    const short = new Agent({ headersTimeout: 10 });
    const agent = nodeHttpAgent(600_000, 600_000);
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    try {
      setGlobalDispatcher(short);
      await expect(fetch(url)).rejects.toThrow();
      setGlobalDispatcher(agent);
      expect(await (await fetch(url)).text()).toBe("local answer");
      await expect(fetch(url, { signal: AbortSignal.timeout(10) })).rejects.toThrow();
    } finally {
      setGlobalDispatcher(original);
      server.closeAllConnections();
      await Promise.all([short.close(), agent.close(), new Promise<void>(resolve => server.close(() => resolve()))]);
    }
  });
});
