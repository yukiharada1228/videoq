import { createApp } from "./app";
import { reconcileAbandonedUploads } from "./lib/upload-reconcile";
import type { Bindings } from "./types/bindings";

// Cloudflare Workers のエントリ（fetch + scheduled）。
const app = createApp();

export default {
  fetch: app.fetch.bind(app),
  async scheduled(
    _controller: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ): Promise<void> {
    // FR-Q3: 放棄アップロードのストレージ予約を定期解放
    ctx.waitUntil(
      reconcileAbandonedUploads(env).then((r) => {
        console.log(
          JSON.stringify({
            msg: "upload_reconcile",
            scanned: r.scanned,
            released: r.released,
            releasedBytes: r.releasedBytes,
            errors: r.errors,
          }),
        );
      }),
    );
  },
};

// Durable Objects（wrangler `durable_objects.bindings` の class_name と一致させる）
export { RateLimiter } from "./durable-objects/rate-limiter";
