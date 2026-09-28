import { CHAT_REQUEST_MAX_BYTES } from "@videoq/trpc/schema";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { toErrorBody } from "../../shared/errors";
import type { AppEnv } from "../../types/bindings";

/** Bound a raw chat request before JSON parsing allocates the complete body. */
export const limitChatRequestBody = bodyLimit({
  maxSize: CHAT_REQUEST_MAX_BYTES,
  onError: (c) =>
    c.json(
      toErrorBody(
        "PAYLOAD_TOO_LARGE",
        `Chat request body must not exceed ${CHAT_REQUEST_MAX_BYTES} bytes.`,
      ),
      413,
    ),
});

/** tRPC batch URLs contain comma-delimited procedure names. */
export const limitChatTrpcRequestBody = createMiddleware<AppEnv>(
  async (c, next) => {
    let procedurePath: string;
    try {
      // Match tRPC's own request adapter: it decodes the URL pathname before
      // splitting batch procedure names. Checking Hono's partially-decoded path
      // would let an encoded comma (`%2C`) bypass this limit.
      const pathname = new URL(c.req.url).pathname;
      procedurePath = decodeURIComponent(
        pathname.slice("/api/trpc/".length),
      );
    } catch {
      return c.json(
        toErrorBody("VALIDATION_ERROR", "Malformed tRPC procedure path."),
        400,
      );
    }
    const procedures = procedurePath.split(",");
    return procedures.includes("chat.send")
      ? await limitChatRequestBody(c, next)
      : await next();
  },
);
