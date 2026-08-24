import { sha256Hex } from "../shared/crypto";

export const GROUP_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export const GROUP_INVITATION_HARD_BATCH_LIMIT = 100;
export const DEFAULT_GROUP_INVITATION_BATCH_LIMIT = 50;

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "revoked";

export type InvitationDeliveryStatus = "queued" | "sent" | "failed";

export type PlannedInvitationEmail = { input: string; email: string };
export type RejectedInvitationEmail = {
  input: string;
  status: "invalid" | "duplicate";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInvitationEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain || local.length > 64 || domain.length > 253) return null;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return null;
  }
  if (
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.startsWith("-") ||
    domain.endsWith("-") ||
    domain.includes("..")
  ) {
    return null;
  }
  return email;
}

export function planInvitationEmails(rawEmails: readonly string[]): {
  ready: PlannedInvitationEmail[];
  rejected: RejectedInvitationEmail[];
} {
  const ready: PlannedInvitationEmail[] = [];
  const rejected: RejectedInvitationEmail[] = [];
  const seen = new Set<string>();

  for (const input of rawEmails) {
    const email = normalizeInvitationEmail(input);
    if (!email) {
      rejected.push({ input, status: "invalid" });
      continue;
    }
    if (seen.has(email)) {
      rejected.push({ input, status: "duplicate" });
      continue;
    }
    seen.add(email);
    ready.push({ input, email });
  }

  return { ready, rejected };
}

export function invitationExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + GROUP_INVITATION_LIFETIME_MS);
}

export function isInvitationExpired(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export function effectiveInvitationStatus(
  status: InvitationStatus,
  expiresAt: Date,
  now = new Date(),
): InvitationStatus {
  return status === "pending" && isInvitationExpired(expiresAt, now)
    ? "expired"
    : status;
}

export function maskInvitationEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local}${domain}`;
  return `${local[0]}${"*".repeat(local.length - 2)}${local.at(-1)}${domain}`;
}

export function createInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function hashInvitationToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export function resolveInvitationBatchLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_GROUP_INVITATION_BATCH_LIMIT;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_GROUP_INVITATION_BATCH_LIMIT;
  }
  return Math.min(value, GROUP_INVITATION_HARD_BATCH_LIMIT);
}
