// PoC #02 — Worker(JS) 側のメッセージ生成ロジック（SigV4 送信を除いた本体）。
// Cloudflare Worker では btoa / TextEncoder / crypto.randomUUID が使える。
// 生成した JSON をそのまま SQS SendMessage の MessageBody にする（外側 base64 は不要）。
//
// 使い方: node build_message.mjs <task> <video_id>
//   出力: 既存 lambda_handler が受理する plain-JSON メッセージ 1 行

const task = process.argv[2] ?? "app.entrypoints.tasks.transcription.transcribe_video";
const videoId = Number(process.argv[3] ?? 123);

// Celery protocol v2 の inner body = [args, kwargs, embed]。embed は Lambda 側で無視される。
const inner = [[videoId], {}, {}];
const bodyB64 = btoa(JSON.stringify(inner)); // Worker: btoa は ASCII 前提。非ASCII引数がある場合は
                                             // TextEncoder→base64 にする（本 PoC の引数は数値のみで安全）。

const message = {
  headers: { task, id: (globalThis.crypto?.randomUUID?.() ?? "worker-uuid-js-0003") },
  body: bodyB64,
};

process.stdout.write(JSON.stringify(message));
