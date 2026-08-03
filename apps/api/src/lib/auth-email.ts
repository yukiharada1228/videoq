import type { Bindings } from "../types/bindings";

const FRONTEND_FALLBACK = "http://localhost:3000";
const FROM_FALLBACK = "noreply@videoq.local";

export function buildVerificationLink(
  env: Bindings,
  token: string,
): string {
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetLink(
  env: Bindings,
  token: string,
): string {
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildEmailChangeLink(
  env: Bindings,
  token: string,
): string {
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/change-email?token=${encodeURIComponent(token)}`;
}

async function sendViaMailgun(
  env: Bindings,
  toEmail: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const apiKey = env.MAILGUN_API_KEY?.trim();
  const domain = (env.MAILGUN_SENDER_DOMAIN || "mg.videoq.jp").trim();
  if (!apiKey) return false;

  const from = env.DEFAULT_FROM_EMAIL ?? `noreply@${domain}`;
  const body = new URLSearchParams({
    from: `VideoQ <${from}>`,
    to: toEmail,
    subject,
    text,
  });
  const auth = btoa(`api:${apiKey}`);
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Mailgun send failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  return true;
}

async function sendMail(
  env: Bindings,
  toEmail: string,
  subject: string,
  lines: string[],
): Promise<void> {
  const text = lines.join("\n");

  // Prefer Mailgun in production cutover (domain already onboarded for Django).
  if (await sendViaMailgun(env, toEmail, subject, text)) return;

  if (!env.EMAIL) throw new Error("EMAIL binding is not configured");
  await env.EMAIL.send({
    to: toEmail,
    from: { email: env.DEFAULT_FROM_EMAIL ?? FROM_FALLBACK, name: "VideoQ" },
    subject,
    text,
  });
}

export async function sendVerificationEmail(
  env: Bindings,
  toEmail: string,
  verificationLink: string,
): Promise<void> {
  await sendMail(env, toEmail, "[VideoQ] 仮登録が完了しました", [
    "VideoQ へのご登録ありがとうございます。",
    "以下のURLをクリックして、本登録を完了させてください。",
    "",
    verificationLink,
  ]);
}

export async function sendPasswordResetEmail(
  env: Bindings,
  toEmail: string,
  resetLink: string,
): Promise<void> {
  await sendMail(env, toEmail, "[VideoQ] パスワード再設定のご案内", [
    "VideoQ のパスワード再設定リクエストを受け付けました。",
    "24時間以内に、以下のURLから新しいパスワードを設定してください。",
    "",
    resetLink,
    "",
    "もしこのリクエストに心当たりがない場合は、このメールを破棄してください。",
  ]);
}

export async function sendEmailChangeConfirmation(
  env: Bindings,
  pendingEmail: string,
  confirmationLink: string,
): Promise<void> {
  await sendMail(env, pendingEmail, "[VideoQ] メールアドレス変更の確認", [
    "VideoQ のメールアドレス変更リクエストを受け付けました。",
    "以下のURLをクリックして、新しいメールアドレスへの変更を完了させてください。",
    "",
    confirmationLink,
  ]);
}
