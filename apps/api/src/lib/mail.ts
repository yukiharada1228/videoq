import type { Bindings } from "../types/bindings";
import { deadlineSignal } from "./request-timeout";

const MAILGUN_TIMEOUT_MS = 15_000;

/** Transactional email via Mailgun. */
export async function sendMail(
  env: Bindings,
  toEmail: string,
  subject: string,
  lines: string[],
): Promise<void> {
  const apiKey = env.MAILGUN_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      env.ENVIRONMENT === "production"
        ? "MAILGUN_API_KEY is required for production email delivery"
        : "MAILGUN_API_KEY is required for email delivery",
    );
  }
  const domain = (env.MAILGUN_SENDER_DOMAIN || "mg.videoq.jp").trim();

  const from = env.DEFAULT_FROM_EMAIL ?? `noreply@${domain}`;
  const body = new URLSearchParams({
    from: `VideoQ <${from}>`,
    to: toEmail,
    subject,
    text: lines.join("\n"),
  });
  const auth = btoa(`api:${apiKey}`);
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: deadlineSignal(MAILGUN_TIMEOUT_MS),
  });
  // 本文は宛先や差出人を含みうるうえ、そのまま last_error として永続化される。
  // 障害切り分けに要るのはステータスなので、本文は捨てる。
  await res.body?.cancel();
  if (!res.ok) {
    throw new Error(`Mailgun send failed (${res.status})`);
  }
}
