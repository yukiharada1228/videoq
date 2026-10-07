import type { Bindings } from "../types/bindings";

/** Both chat transports must run the complete agent outside the edge CPU budget. */
export function isChatExecutionRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return false;
  }
  if (path === "/api/chat/messages/stream") return true;
  return path.startsWith("/api/trpc/") &&
    path.slice("/api/trpc/".length).split(",").includes("chat.send");
}

/** One execution per answer; independent answers never share a bottleneck. */
export function dispatchChatExecution(request: Request, env: Bindings): Promise<Response> {
  const execution = env.CHAT_EXECUTION.get(env.CHAT_EXECUTION.newUniqueId());
  // Pass the response body through untouched: draining SSE here would move
  // per-token work back into the Free Worker's 10 ms CPU budget.
  // Never retry a POST: it may already have reserved quota or called a model.
  return execution.fetch(request);
}
