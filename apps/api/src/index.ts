import { createApp, type AppType } from "./app";
import { runScheduledMaintenance } from "./lib/scheduled-maintenance";
import type { Bindings } from "./types/bindings";

export type { AppType };

// Cloudflare Workers のエントリ（fetch + scheduled）。
const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(
    controller: ScheduledController,
    env: Bindings,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runScheduledMaintenance(env, controller.cron);
  },
} satisfies ExportedHandler<Bindings>;

// Durable Objects（wrangler `durable_objects.bindings` の class_name と一致させる）
export { RateLimiter } from "./durable-objects/rate-limiter";
export { StudySession } from "./durable-objects/study-session";
