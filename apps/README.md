# apps/

VideoQ の実行パッケージです。

| ディレクトリ | 役割 | ランタイム |
|---|---|---|
| [`api/`](api/) | OpenAPI Web API | Hono / Cloudflare Workers |
| [`worker/`](worker/) | 文字起こし・索引・PLOG・評価などの非同期処理 | Python / SQS Lambda |

ローカル全体起動:

```bash
docker compose up --build -d
```

フロントエンドの HMR が必要な場合:

```bash
docker compose --profile dev up -d web-dev
```
