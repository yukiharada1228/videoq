import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { TEST_USER_ID, signAccessToken, testAuthHeaders } from "./helpers/auth";
import * as courseService from "../src/features/courses/service";

const SECRET = "route-order-secret";

const ENV = {
  ENVIRONMENT: "test",
  CORS_ALLOW_ORIGIN: "http://localhost:5173",
  AUTH_JWT_SECRET: SECRET,
} as unknown as Parameters<ReturnType<typeof createApp>["request"]>[2];

vi.mock("../src/repositories/auth-repository", () => ({
  isAuthSessionActive: vi.fn(async () => true),
}));

vi.mock("../src/features/courses/service", () => ({
  listCourses: vi.fn(async () => ({ count: 0, results: [] })),
  reorderUserCourses: vi.fn(async () => ({ ok: true })),
}));

describe("GET /api/videos/courses route order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not treat 'courses' as a video id (NaN validation)", async () => {
    const app = createApp();
    const token = await signAccessToken(SECRET);
    const res = await app.request(
      "/api/videos/courses",
      { headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" } },
      ENV,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).not.toMatchObject({
      error: { message: expect.stringContaining("NaN") },
    });
    expect(body).toMatchObject({
      data: [],
      meta: { total: 0 },
    });
  });
});

describe("PATCH /api/videos/courses/order route order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not treat 'order' as a course id (NaN validation)", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/videos/courses/order",
      {
        method: "PATCH",
        headers: {
          ...testAuthHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ course_ids: [2, 1] }),
      },
      ENV,
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ message: "Course order updated" });
    expect(courseService.reorderUserCourses).toHaveBeenCalledWith(
      ENV,
      TEST_USER_ID,
      [2, 1],
    );
  });
});
