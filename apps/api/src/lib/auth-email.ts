import { encodePkToUid, makeDjangoToken, makeEmailChangeToken } from "./django-token";
import type { Bindings } from "../types/bindings";

/**
 * 認証系メール（Django `infrastructure/common/email.py` 相当）。
 * リンクの token は `default_token_generator`、uid は `urlsafe_base64_encode(pk)`。
 * 送信は Cloudflare Email Sending（env.EMAIL.send）。ドメイン onboarding が実配信の前提。
 */

const FRONTEND_FALLBACK = "http://localhost:3000";
const FROM_FALLBACK = "noreply@videoq.local";

/** signup の検証リンク: `{FRONTEND_URL}/verify-email?uid=...&token=...` */
export async function buildVerificationLink(
  env: Bindings,
  user: { pk: number; passwordHash: string; email: string },
): Promise<string> {
  const token = await makeDjangoToken(env, {
    pk: user.pk,
    password: user.passwordHash,
    email: user.email,
    lastLogin: null, // 新規は last_login=None
  });
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/verify-email?uid=${encodePkToUid(user.pk)}&token=${token}`;
}

/** パスワード再設定リンク: `{FRONTEND_URL}/reset-password?uid=...&token=...` */
export async function buildPasswordResetLink(
  env: Bindings,
  user: { pk: number; passwordHash: string; email: string; lastLogin: string | null },
): Promise<string> {
  const token = await makeDjangoToken(env, {
    pk: user.pk,
    password: user.passwordHash,
    email: user.email,
    lastLogin: user.lastLogin,
  });
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/reset-password?uid=${encodePkToUid(user.pk)}&token=${token}`;
}

/**
 * メール変更の確認リンク: `{FRONTEND_URL}/change-email?uid=...&token=...`
 * token は `EmailChangeTokenGenerator`（pending_email が変わると失効する）。
 */
export async function buildEmailChangeLink(
  env: Bindings,
  user: {
    pk: number;
    passwordHash: string;
    email: string;
    pendingEmail: string;
    lastLogin: string | null;
  },
): Promise<string> {
  const token = await makeEmailChangeToken(env, {
    pk: user.pk,
    password: user.passwordHash,
    email: user.email,
    lastLogin: user.lastLogin,
    pendingEmail: user.pendingEmail,
  });
  const frontend = env.FRONTEND_URL ?? FRONTEND_FALLBACK;
  return `${frontend}/change-email?uid=${encodePkToUid(user.pk)}&token=${token}`;
}

async function sendMail(
  env: Bindings,
  toEmail: string,
  subject: string,
  lines: string[],
): Promise<void> {
  if (!env.EMAIL) throw new Error("EMAIL binding is not configured");
  await env.EMAIL.send({
    to: toEmail,
    from: { email: env.DEFAULT_FROM_EMAIL ?? FROM_FALLBACK, name: "VideoQ" },
    subject,
    text: lines.join("\n"),
  });
}

/** 検証メールを送信（send_email_verification の件名/本文と一致）。失敗は throw。 */
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

/** 再設定メールを送信（send_password_reset_email の件名/本文と一致）。失敗は throw。 */
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

/**
 * メール変更の確認メールを送信（send_email_change_confirmation 相当）。
 * 宛先は **新しいアドレス**（pending_email）。失敗は throw。
 */
export async function sendEmailChangeConfirmation(
  env: Bindings,
  pendingEmail: string,
  confirmationLink: string,
): Promise<void> {
  await sendMail(env, pendingEmail, "[VideoQ] メールアドレス変更の確認", [
    "VideoQ のメールアドレス変更リクエストを受け付けました。",
    "以下のURLをクリックして、新しいメールアドレスへの変更を完了してください。",
    "",
    confirmationLink,
    "",
    "もしこのリクエストに心当たりがない場合は、このメールを破棄してください。",
  ]);
}
