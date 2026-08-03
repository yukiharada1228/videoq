import { AwsClient } from "aws4fetch";
import type { Bindings } from "../types/bindings";

/**
 * SQS SendMessage（aws4fetch SigV4, query プロトコル）。PoC #02 で実 AWS/ElasticMQ 疎通済み。
 * MessageBody はそのまま送る（方式 B: 外側 base64 不要の plain JSON）。返り値は MessageId。
 * IAM は sqs:SendMessage のみに限定する（JR-5）。
 */
export async function sendSqsMessage(
  env: Bindings,
  messageBody: string,
): Promise<string | null> {
  // Local wrangler often has no SQS. Return null so callers can leave the row
  // pending and a local worker can drain it (see apps/worker README).
  if (!env.SQS_QUEUE_URL) return null;
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
    region: env.AWS_REGION ?? "ap-northeast-1",
    service: "sqs",
  });

  const form = new URLSearchParams({
    Action: "SendMessage",
    Version: "2012-11-05",
    MessageBody: messageBody,
  });

  const res = await aws.fetch(env.SQS_QUEUE_URL, {
    method: "POST",
    body: form.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQS SendMessage failed: ${res.status} ${text}`);
  }
  return (text.match(/<MessageId>([^<]+)<\/MessageId>/) || [])[1] ?? null;
}
