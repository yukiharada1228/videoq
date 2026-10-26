import { Agent } from "undici";

/** Keep Node's transport from cutting off a configured local-model deadline. */
export function nodeHttpAgent(requestTimeoutMs: number, streamTimeoutMs: number): Agent {
  const timeout = Math.max(300_000, requestTimeoutMs, streamTimeoutMs);
  return new Agent({ headersTimeout: timeout, bodyTimeout: timeout });
}
