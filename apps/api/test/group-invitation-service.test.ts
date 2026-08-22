import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  createPendingGroupInvitations: vi.fn(),
  recordInvitationDeliveryOutcomes: vi.fn(),
  rotatePendingGroupInvitation: vi.fn(),
}));

const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));

vi.mock("../src/repositories/group-invitation-repository", () => repo);
vi.mock("../src/lib/mail", () => mail);

import {
  inviteGroupMembers,
  resendInvitation,
} from "../src/features/group-memberships/service";

const ENV = {
  FRONTEND_URL: "https://videoq.example",
  GROUP_INVITATION_BATCH_LIMIT: "3",
} as never;

describe("inviteGroupMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.recordInvitationDeliveryOutcomes.mockResolvedValue(undefined);
  });

  it("メール送信はリクエスト内で行わず、配送タスクに委譲する", async () => {
    repo.createPendingGroupInvitations.mockResolvedValue({
      created: [
        { id: 10, email: "a@example.com", groupName: "Physics", inviterName: "Teacher" },
        { id: 11, email: "b@example.com", groupName: "Physics", inviterName: "Teacher" },
      ],
      alreadyMemberEmails: [],
      alreadyPendingEmails: [],
    });

    const result = await inviteGroupMembers(
      ENV,
      5,
      "teacher-user",
      ["a@example.com", "b@example.com"],
      new Date("2026-08-22T00:00:00.000Z"),
    );

    expect(result).toMatchObject({
      results: [
        { email: "a@example.com", status: "queued", invitation_id: 10 },
        { email: "b@example.com", status: "queued", invitation_id: 11 },
      ],
    });
    // 送信も配信結果の記録も、この経路では起きない。
    expect(mail.sendMail).not.toHaveBeenCalled();
    expect(repo.recordInvitationDeliveryOutcomes).not.toHaveBeenCalled();
  });

  it("平文トークンを保存せず、招待ごとに異なるダミーhashを渡す", async () => {
    repo.createPendingGroupInvitations.mockResolvedValue({
      created: [],
      alreadyMemberEmails: [],
      alreadyPendingEmails: [],
    });

    await inviteGroupMembers(ENV, 5, "teacher-user", [
      "a@example.com",
      "b@example.com",
    ]);

    const prepared = repo.createPendingGroupInvitations.mock.calls[0][3] as {
      email: string;
      tokenHash: string;
    }[];
    expect(prepared).toHaveLength(2);
    for (const input of prepared) {
      expect(input.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(prepared[0].tokenHash).not.toBe(prepared[1].tokenHash);
  });

  it("returns invalid, duplicate, already-member, and already-invited results", async () => {
    repo.createPendingGroupInvitations.mockResolvedValue({
      created: [],
      alreadyMemberEmails: ["member@example.com"],
      alreadyPendingEmails: ["pending@example.com"],
    });

    const result = await inviteGroupMembers(
      { ...ENV, GROUP_INVITATION_BATCH_LIMIT: "4" } as never,
      5,
      "teacher-user",
      [
        "bad",
        "member@example.com",
        "pending@example.com",
        "MEMBER@example.com",
      ],
    );

    expect(result).toEqual({
      results: [
        { email: "bad", status: "invalid" },
        { email: "member@example.com", status: "already_member" },
        { email: "pending@example.com", status: "already_invited" },
        { email: "MEMBER@example.com", status: "duplicate" },
      ],
    });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("rejects requests above the configured batch limit before touching storage", async () => {
    const result = await inviteGroupMembers(
      ENV,
      5,
      "teacher-user",
      ["a@example.com", "b@example.com", "c@example.com", "d@example.com"],
    );

    expect(result).toEqual({ tooMany: true, limit: 3 });
    expect(repo.createPendingGroupInvitations).not.toHaveBeenCalled();
  });

  it("counts case-insensitive duplicates as one recipient for the batch limit", async () => {
    repo.createPendingGroupInvitations.mockResolvedValue({
      created: [],
      alreadyMemberEmails: [],
      alreadyPendingEmails: [],
    });

    const result = await inviteGroupMembers(
      ENV,
      5,
      "teacher-user",
      ["a@example.com", "A@example.com", "b@example.com", "c@example.com"],
    );

    expect(result).toEqual({
      results: [
        { email: "a@example.com", status: "queued" },
        { email: "A@example.com", status: "duplicate" },
        { email: "b@example.com", status: "queued" },
        { email: "c@example.com", status: "queued" },
      ],
    });
    expect(repo.createPendingGroupInvitations).toHaveBeenCalledOnce();
  });

  it("does not send mail when the group is not owned by the caller", async () => {
    repo.createPendingGroupInvitations.mockResolvedValue({ notFound: true });

    const result = await inviteGroupMembers(
      ENV,
      999,
      "not-owner",
      ["a@example.com"],
    );

    expect(result).toEqual({ notFound: true });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});

describe("resendInvitation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("古いトークンを即座に失効させ、配送はタスクに任せる", async () => {
    repo.rotatePendingGroupInvitation.mockResolvedValue({
      id: 10,
      email: "a@example.com",
      groupName: "Physics",
      inviterName: "Teacher",
    });

    const result = await resendInvitation(ENV, 5, 10, "teacher-user");

    expect(result).toEqual({ ok: true, delivery_status: "queued" });
    // 差し替え先は誰も知らないダミーhash。平文トークンは渡さない。
    const tokenHash = repo.rotatePendingGroupInvitation.mock.calls[0][4];
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("pending でない招待は再送しない", async () => {
    repo.rotatePendingGroupInvitation.mockResolvedValue({ invalidState: "revoked" });

    const result = await resendInvitation(ENV, 5, 10, "teacher-user");

    expect(result).toEqual({ invalidState: "revoked" });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
});
