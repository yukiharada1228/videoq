import { Hono } from "hono";
import { AwsClient } from "aws4fetch";

type Bindings = {
  QUEUE_URL: string;
  REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
};
const app = new Hono<{ Bindings: Bindings }>();

// Worker → SQS SendMessage を aws4fetch(SigV4) で実行し、既存 Lambda が受理する
// 最小メッセージ（headers.task/id + base64(json([args,kwargs,embed]))）を送る。
app.get("/enqueue", async (c) => {
  const task = c.req.query("task") ?? "app.entrypoints.tasks.transcription.transcribe_video";
  const videoId = Number(c.req.query("video") ?? 123);

  const inner = [[videoId], {}, {}]; // [args, kwargs, embed]
  const message = {
    headers: { task, id: crypto.randomUUID() },
    body: btoa(JSON.stringify(inner)),
  };

  // ローカル ElasticMQ では dummy 資格情報、実 AWS では .dev.vars 由来の実資格情報。
  const aws = new AwsClient({
    accessKeyId: c.env.AWS_ACCESS_KEY_ID ?? "local",
    secretAccessKey: c.env.AWS_SECRET_ACCESS_KEY ?? "local",
    sessionToken: c.env.AWS_SESSION_TOKEN, // 一時資格情報のときのみ
    region: c.env.REGION ?? "us-east-1",
    service: "sqs",
  });

  const form = new URLSearchParams({
    Action: "SendMessage",
    Version: "2012-11-05",
    MessageBody: JSON.stringify(message),
  });

  const res = await aws.fetch(c.env.QUEUE_URL, {
    method: "POST",
    body: form.toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const text = await res.text();
  const messageId = (text.match(/<MessageId>([^<]+)<\/MessageId>/) || [])[1] ?? null;

  return c.json({
    ok: res.ok,
    status: res.status,
    signed_by: "aws4fetch SigV4 (workerd)",
    message_id: messageId,
    sent_message: message,
  });
});

export default app;
