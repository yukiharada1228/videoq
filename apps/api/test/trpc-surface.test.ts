import { describe, expect, it } from "vitest";
import { appRouter, type TrpcContext } from "@videoq/trpc";
import { createApp } from "../src/app";

const EXPECTED_PROCEDURES = [
  "account.deleteSearchApiKey",
  "account.me",
  "account.saveSearchApiKey",
  "account.searchApiKeyStatus",
  "admin.deleteUser",
  "admin.getUser",
  "admin.listUsers",
  "admin.patchFlags",
  "admin.patchQuota",
  "admin.patchUsage",
  "admin.reindexAll",
  "billing.checkout",
  "billing.plans",
  "billing.portal",
  "chat.analytics",
  "chat.feedback",
  "chat.history",
  "chat.resetHistory",
  "chat.send",
  "courseMemberships.accept",
  "courseMemberships.decline",
  "courseMemberships.invite",
  "courseMemberships.leave",
  "courseMemberships.participants",
  "courseMemberships.preview",
  "courseMemberships.removeMember",
  "courseMemberships.resend",
  "courseMemberships.revoke",
  "courses.create",
  "courses.createShare",
  "courses.delete",
  "courses.deleteShare",
  "courses.get",
  "courses.list",
  "courses.reorder",
  "courses.replace",
  "courses.shared",
  "courses.update",
  "evaluation.logs",
  "evaluation.summary",
  "memberships.addTags",
  "memberships.addVideo",
  "memberships.addVideos",
  "memberships.removeTag",
  "memberships.removeVideo",
  "memberships.reorderVideos",
  "plog.createConcept",
  "plog.createEdge",
  "plog.deleteConcept",
  "plog.deleteEdge",
  "plog.graph",
  "plog.learnerState",
  "plog.mergeConcepts",
  "plog.rebuild",
  "plog.resetLearnerState",
  "plog.updateConcept",
  "plog.updateEdge",
  "plog.updateLearningObject",
  "tags.create",
  "tags.delete",
  "tags.get",
  "tags.list",
  "tags.replace",
  "tags.update",
  "videos.confirmUpload",
  "videos.createYoutube",
  "videos.delete",
  "videos.get",
  "videos.list",
  "videos.replace",
  "videos.requestUpload",
  "videos.statusCounts",
  "videos.update",
] as const;

const ENV = { ENVIRONMENT: "test" } as CloudflareBindings;

describe("tRPC public surface", () => {
  it("keeps every application procedure in the shared router", () => {
    expect(Object.keys(appRouter._def.procedures).sort()).toEqual(EXPECTED_PROCEDURES);
  });

  it("mounts every shared procedure through the Hono tRPC adapter", async () => {
    const app = createApp();

    for (const [path, procedure] of Object.entries(appRouter._def.procedures)) {
      // Use the opposite HTTP method so tRPC proves that it recognized the
      // procedure without invoking an application handler or external service.
      const method = procedure._def.type === "query" ? "POST" : "GET";
      const response = await app.request(
        `/api/trpc/${path}`,
        method === "POST"
          ? {
              method,
              headers: { "content-type": "application/json" },
              body: "{}",
            }
          : { method },
        ENV,
      );
      expect(response.status, path).toBe(405);
    }
  });

  it("requires a browser session for protected writes", async () => {
    const caller = appRouter.createCaller({
      userId: null,
      assertSuperuser: async () => undefined,
      call: async () => ({ deleted: 0 }),
    } as TrpcContext);

    await expect(caller.plog.resetLearnerState({ videoId: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
