import { describe, expect, it } from "vitest";
import {
  effectiveInvitationStatus,
  invitationExpiresAt,
  isInvitationExpired,
  maskInvitationEmail,
  planInvitationEmails,
} from "../src/lib/course-invitations";

describe("course invitation domain", () => {
  it("normalizes valid addresses and preserves first-seen order", () => {
    expect(
      planInvitationEmails([
        " Student@One.EXAMPLE ",
        "second@example.com",
      ]),
    ).toEqual({
      ready: [
        { input: " Student@One.EXAMPLE ", email: "student@one.example" },
        { input: "second@example.com", email: "second@example.com" },
      ],
      rejected: [],
    });
  });

  it("rejects invalid addresses and reports case-insensitive duplicates", () => {
    expect(
      planInvitationEmails([
        "not-an-email",
        "student@example.com",
        "STUDENT@example.com",
        "",
      ]),
    ).toEqual({
      ready: [{ input: "student@example.com", email: "student@example.com" }],
      rejected: [
        { input: "not-an-email", status: "invalid" },
        { input: "STUDENT@example.com", status: "duplicate" },
        { input: "", status: "invalid" },
      ],
    });
  });

  it("uses an exact seven-day lifetime and treats the boundary as expired", () => {
    const issuedAt = new Date("2026-08-22T00:00:00.000Z");
    const expiresAt = invitationExpiresAt(issuedAt);

    expect(expiresAt.toISOString()).toBe("2026-08-29T00:00:00.000Z");
    expect(
      isInvitationExpired(expiresAt, new Date("2026-08-28T23:59:59.999Z")),
    ).toBe(false);
    expect(isInvitationExpired(expiresAt, expiresAt)).toBe(true);
  });

  it("treats only time-expired pending invitations as terminal expired state", () => {
    const now = new Date("2026-08-29T00:00:00.000Z");

    expect(
      effectiveInvitationStatus(
        "pending",
        new Date("2026-08-28T23:59:59.999Z"),
        now,
      ),
    ).toBe("expired");
    expect(
      effectiveInvitationStatus(
        "pending",
        new Date("2026-08-29T00:00:00.001Z"),
        now,
      ),
    ).toBe("pending");
    expect(
      effectiveInvitationStatus(
        "accepted",
        new Date("2026-08-28T00:00:00.000Z"),
        now,
      ),
    ).toBe("accepted");
  });

  it("masks the local part in public invitation previews", () => {
    expect(maskInvitationEmail("student@example.com")).toBe("s*****t@example.com");
    expect(maskInvitationEmail("a@example.com")).toBe("a@example.com");
  });
});
