import type { Bindings } from "../types/bindings";

const encoder = new TextEncoder();

function keySecret(env: Bindings): string {
  const secret = env.BETTER_AUTH_SECRET?.trim() || env.AUTH_JWT_SECRET?.trim();
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required for shared chat feedback");
  return secret;
}

async function feedbackKey(env: Bindings): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", encoder.encode(keySecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

function signedMessage(chatLogId: number, shareSlug: string) {
  return encoder.encode(`videoq:chat-feedback:v1\n${chatLogId}\n${shareSlug}`);
}

/** A bearer capability for one answer in the current shared course. */
export async function createChatFeedbackToken(
  env: Bindings, chatLogId: number, shareSlug: string,
): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await feedbackKey(env), signedMessage(chatLogId, shareSlug));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyChatFeedbackToken(
  env: Bindings, chatLogId: number, shareSlug: string, token: string | undefined,
): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const signature = new Uint8Array(token.match(/../g)!.map(hex => Number.parseInt(hex, 16)));
  return crypto.subtle.verify("HMAC", await feedbackKey(env), signature, signedMessage(chatLogId, shareSlug));
}
