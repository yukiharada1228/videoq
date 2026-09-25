export { RateLimiter } from "../../src/durable-objects/rate-limiter";
export { TaskScheduler } from "../../src/durable-objects/task-scheduler";

export default {
  fetch(): Response {
    return new Response("Workers runtime test entrypoint");
  },
} satisfies ExportedHandler<CloudflareBindings>;
