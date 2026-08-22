import type { Bindings } from "../types/bindings";

const FROM_FALLBACK = "noreply@videoq.local";

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
    // 本文は宛先や差出人を含みうるうえ、そのまま last_error として永続化される。
    // 障害切り分けに要るのはステータスなので、本文は捨てる。
    await res.body?.cancel();
    throw new Error(`Mailgun send failed (${res.status})`);
  }
  await res.body?.cancel();
  return true;
}

/** Transactional email via Mailgun (preferred) or Cloudflare Email Sending. */
export async function sendMail(
  env: Bindings,
  toEmail: string,
  subject: string,
  lines: string[],
): Promise<void> {
  const text = lines.join("\n");
  if (await sendViaMailgun(env, toEmail, subject, text)) return;
  if (!env.EMAIL) throw new Error("EMAIL binding is not configured");
  await env.EMAIL.send({
    to: toEmail,
    from: { email: env.DEFAULT_FROM_EMAIL ?? FROM_FALLBACK, name: "VideoQ" },
    subject,
    text,
  });
}
