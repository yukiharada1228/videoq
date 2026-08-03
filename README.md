# VideoQ

VideoQ は、動画を自動で文字起こしし、自然言語の質問から関連シーンへ移動できる AI 動画ナビゲーションです。

**https://videoq.jp/**

![VideoQ Application Screenshot](assets/screenshot.png)

## 主な機能

- 動画アップロードと YouTube 取り込み
- 文字起こし、シーン分割、ベクトル検索
- RAG チャットと学習モード（PLOG）
- 動画グループ、タグ、共有リンク
- API キー、OpenAI 互換 API、MCP
- 日本語・英語 UI

## アーキテクチャ

| 役割 | 実装 | ランタイム |
|---|---|---|
| Web UI | [`frontend/`](frontend/) | React / Cloudflare Pages |
| Web API | [`apps/api/`](apps/api/) | Hono / Cloudflare Workers |
| 非同期ジョブ | [`apps/worker/`](apps/worker/) | Python / AWS Lambda |
| DB | Drizzle schema + PostgreSQL / pgvector | Neon + Hyperdrive |
| オブジェクト | R2（ローカルは MinIO） | S3 互換 API |
| キュー | Amazon SQS（ローカルは ElasticMQ） | native JSON job |

API は `OpenAPIHono` の feature / service / repository 構成です。スキーマの正本は
[`apps/api/src/db/schema/modern.ts`](apps/api/src/db/schema/modern.ts) と
[`apps/api/drizzle/`](apps/api/drizzle/) です。

## ローカル起動

必要なもの:

- Docker / Docker Compose
- OpenAI API キー（チャット・文字起こしを利用する場合）
- 任意: Ollama（ローカル埋め込み）

```bash
git clone https://github.com/yukiharada1228/videoq.git
cd videoq
cp .env.example .env
# .env に AUTH_JWT_SECRET と USER_SECRET_ENCRYPTION_KEY を設定
docker compose up --build -d
```

| サービス | URL |
|---|---|
| アプリ | http://localhost |
| API（直接） | http://127.0.0.1:8787 |
| Scalar API docs | http://localhost/api/docs |
| OpenAPI JSON | http://localhost/api/openapi.json |
| MinIO console | http://127.0.0.1:9001 |
| ElasticMQ stats | http://127.0.0.1:9325 |

フロントエンドの HMR が必要な場合:

```bash
docker compose --profile dev up -d web-dev
```

ログ:

```bash
docker compose logs -f gateway api worker web
```

## 開発

```bash
cd apps/api && npm run typecheck && npm test
cd frontend && npm test
cd apps/worker && python -m pytest tests/ -q
```

詳細:

- [API 開発](apps/api/README.md)
- [非同期 worker](apps/worker/README.md)
- [設計ドキュメント](docs/README.md)
- [デプロイ](infra/DEPLOY.md)

## API / MCP

設定画面で発行した `vq_...` API キーを利用します。

```bash
curl -H "X-API-Key: vq_xxx" https://videoq.jp/api/videos
```

OpenAI 互換 API は `Authorization: Bearer vq_xxx`、MCP は
`POST /api/mcp` を使用します。OAuth クライアントは Discovery、DCR、PKCE、
token、revoke、introspection の標準エンドポイントを利用できます。

## License

[LICENSE](LICENSE) を参照してください。
