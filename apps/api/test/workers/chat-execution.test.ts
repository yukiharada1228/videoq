import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAT_REQUEST_MAX_BYTES } from "@videoq/trpc/schema";

// pg's CJS loader is not supported by Vitest's module runner in workerd.
// These transport tests must never access a database or an external model.
vi.mock("pg", () => ({ default: { Client: class {
  connect() { throw new Error("Unexpected database connection"); }
} } }));

const { streamChatMessage } = vi.hoisted(() => ({ streamChatMessage: vi.fn() }));
vi.mock("../../src/features/chat/message-service", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/features/chat/message-service")>(),
  streamChatMessage: (...args: unknown[]) => streamChatMessage(...args),
}));

afterEach(() => { streamChatMessage.mockReset(); });

// Load Vite-managed modules in the test runner, before entering a DO's I/O
// context. Production Wrangler bundles these imports ahead of time.
await import("../../src/app");

describe("ChatExecution in Workers", () => {
  it("does not expose unrelated routes through the execution", async () => {
    const stub = env.CHAT_EXECUTION.get(env.CHAT_EXECUTION.newUniqueId());
    const response = await stub.fetch("https://videoq.test/api/auth/get-session");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("runs the HTTP request limit before auth or agent execution", async () => {
    const stub = env.CHAT_EXECUTION.get(env.CHAT_EXECUTION.newUniqueId());
    const response = await stub.fetch("https://videoq.test/api/chat/messages/stream", {
      method: "POST", body: "x".repeat(CHAT_REQUEST_MAX_BYTES + 1),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(streamChatMessage).not.toHaveBeenCalled();
  });

  it("streams progress before completion and cancels execution when the reader leaves", async () => {
    let signal: AbortSignal | undefined;
    let aborted: (() => void) | undefined;
    const cancellation = new Promise<void>((resolve) => { aborted = resolve; });
    streamChatMessage.mockImplementation(async (_env, options) => {
      signal = options.clientSignal;
      signal!.addEventListener("abort", () => aborted!(), { once: true });
      return { write: async (send: (value: unknown) => Promise<void>) => {
        await send({ type: "tool_progress", call_id: 1, tool: "overview_video", status: "running" });
        await cancellation;
      } };
    });
    const stub = env.CHAT_EXECUTION.get(env.CHAT_EXECUTION.newUniqueId());
    const response = await stub.fetch("http://localhost/api/chat/messages/stream?tool_progress=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-VideoQ-Test-User-Id": "transport-user" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Find the scene" }], course_id: null }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"tool":"overview_video"');
    expect(signal?.aborted).toBe(false);
    await reader.cancel();
    await cancellation;
    expect(signal?.aborted).toBe(true);
  });
});
