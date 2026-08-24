import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_USER_ID, testAuthHeaders } from "./helpers/auth";

const service = vi.hoisted(() => ({
  inviteCourseMembers: vi.fn(),
  getCourseParticipants: vi.fn(),
  previewCourseInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  removeMember: vi.fn(),
  leaveCourse: vi.fn(),
}));

vi.mock("../src/features/course-memberships/service", () => service);
vi.mock("../src/db/pool", () => ({
  withDb: vi.fn(async (_env, callback) => callback({})),
}));
vi.mock("../src/lib/auth", () => ({
  createAuth: vi.fn(() => ({
    api: { getSession: vi.fn(async () => null) },
  })),
}));

import { courseMembershipRoutes } from "../src/features/course-memberships/routes";

const ENV = {
  ENVIRONMENT: "development",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as never;

const jsonHeaders = {
  ...testAuthHeaders(),
  "content-type": "application/json",
};

describe("course membership routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a batch of email invitations for an authenticated owner", async () => {
    service.inviteCourseMembers.mockResolvedValue({
      results: [
        { email: "a@example.com", status: "queued", invitation_id: 10 },
        { email: "bad", status: "invalid" },
      ],
    });

    const response = await courseMembershipRoutes.request(
      "/courses/5/invitations",
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ emails: ["a@example.com", "bad"] }),
      },
      ENV,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      results: [
        { email: "a@example.com", status: "queued", invitation_id: 10 },
        { email: "bad", status: "invalid" },
      ],
    });
    expect(service.inviteCourseMembers).toHaveBeenCalledWith(
      ENV,
      5,
      TEST_USER_ID,
      ["a@example.com", "bad"],
    );
  });

  it("passes an overlong address to per-recipient validation without rejecting valid peers", async () => {
    const overlong = `${"a".repeat(250)}@example.com`;
    service.inviteCourseMembers.mockResolvedValue({
      results: [
        { email: overlong, status: "invalid" },
        { email: "valid@example.com", status: "queued", invitation_id: 12 },
      ],
    });

    const response = await courseMembershipRoutes.request(
      "/courses/5/invitations",
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ emails: [overlong, "valid@example.com"] }),
      },
      ENV,
    );

    expect(response.status).toBe(201);
    expect(service.inviteCourseMembers).toHaveBeenCalledWith(
      ENV,
      5,
      TEST_USER_ID,
      [overlong, "valid@example.com"],
    );
  });

  it("returns a public masked invitation preview without authentication", async () => {
    service.previewCourseInvitation.mockResolvedValue({
      course_id: 5,
      course_name: "Physics",
      inviter_name: "Teacher",
      email_hint: "s*****t@example.com",
      status: "pending",
      expires_at: "2026-08-29T00:00:00.000Z",
    });

    const response = await courseMembershipRoutes.request(
      "/course-invitations/public-token",
      {},
      ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      course_name: "Physics",
      email_hint: "s*****t@example.com",
      status: "pending",
    });
  });

  it("creates membership only through the authenticated accept endpoint", async () => {
    service.acceptInvitation.mockResolvedValue({ ok: true, courseId: 5 });

    const response = await courseMembershipRoutes.request(
      "/course-invitations/public-token/accept",
      { method: "POST", headers: testAuthHeaders() },
      ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ course_id: 5, status: "accepted" });
    expect(service.acceptInvitation).toHaveBeenCalledWith(
      ENV,
      "public-token",
      TEST_USER_ID,
    );
  });

  it("rejects acceptance by an account with a different verified email", async () => {
    service.acceptInvitation.mockResolvedValue({ emailMismatch: true });

    const response = await courseMembershipRoutes.request(
      "/course-invitations/public-token/accept",
      { method: "POST", headers: testAuthHeaders() },
      ENV,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "INVITATION_EMAIL_MISMATCH" },
    });
  });

  it("requires authentication for accepting an invitation", async () => {
    const response = await courseMembershipRoutes.request(
      "/course-invitations/public-token/accept",
      { method: "POST" },
      ENV,
    );

    expect(response.status).toBe(401);
    expect(service.acceptInvitation).not.toHaveBeenCalled();
  });
});
