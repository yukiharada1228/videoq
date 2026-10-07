import { describe, expect, it, vi } from "vitest";
import { dispatchChatExecution, isChatExecutionRequest } from "../src/lib/chat-execution";
import type { Bindings } from "../src/types/bindings";

describe("chat execution routing", () => {
  it.each([
    "/api/chat/messages/stream?tool_progress=1",
    "/api/trpc/chat.send",
    "/api/trpc/chat.send,courses.get?batch=1",
    "/api/trpc/courses.get%2Cchat%2Esend?batch=1",
  ])("moves the entire chat request to its execution: %s", (path) => {
    expect(isChatExecutionRequest(new Request(`https://videoq.test${path}`, { method: "POST" }))).toBe(true);
  });

  it.each([
    ["GET", "/api/trpc/chat.send"],
    ["POST", "/api/trpc/chat.feedback"],
    ["POST", "/api/trpc/chat.sendExtra"],
    ["POST", "/api/auth/sign-in/social"],
    ["POST", "/api/trpc/%broken"],
  ])("leaves other requests on their existing route: %s %s", (method, path) => {
    expect(isChatExecutionRequest(new Request(`https://videoq.test${path}`, { method }))).toBe(false);
  });

  it("preserves the request and live response without buffering or retrying", async () => {
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream({ cancel: cancelled }), {
      headers: { "Content-Type": "text/event-stream", "X-Request-Id": "execution-id" },
    });
    const fetch = vi.fn().mockResolvedValue(response);
    const newUniqueId = vi.fn().mockReturnValueOnce("first").mockReturnValueOnce("second");
    const get = vi.fn(() => ({ fetch }));
    const env = { CHAT_EXECUTION: { newUniqueId, get } } as unknown as Bindings;
    const request = new Request("https://videoq.test/api/chat/messages/stream?tool_progress=1", {
      method: "POST", body: "{}", headers: { cookie: "session=test", "accept-language": "ja" },
    });

    const result = await dispatchChatExecution(request, env);
    expect(fetch).toHaveBeenCalledWith(request);
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    await result.body!.cancel();
    expect(cancelled).toHaveBeenCalledOnce();

    fetch.mockRejectedValueOnce(new Error("Execution failed after model start"));
    await expect(dispatchChatExecution(request, env)).rejects.toThrow("Execution failed");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.map(([id]) => id)).toEqual(["first", "second"]);
  });
});
