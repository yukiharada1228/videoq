# 実行環境とデプロイの単位

「ローカルで動くものが、本番ではどこで動くか」を確認する資料です。
初参加時は[開発環境を動かす](../getting-started/local-setup.md)を使ってください。
本番へ反映する作業では、この配置図に加えて末尾の運用手順を確認します。

## ローカル Docker Compose

```mermaid
flowchart TB
    Browser --> Gateway[Caddy :80/:443]
    Gateway --> Web[web<br/>nginx static SPA]
    Gateway --> API[api<br/>wrangler dev :8787]
    API --> DB[(postgres :5432)]
    API --> Object[(minio :9000)]
    API --> Queue[elasticmq :9324]
    Queue --> Worker[worker<br/>SQS long poll]
    Worker --> DB
    Worker --> Object
    Migrate[migrate<br/>Drizzle] --> DB
```

`migrate` が完了してから API と worker が起動します。`web-dev` profile は
Vite HMR を追加しますが、API・DB・queue の構成は変わりません。

## 本番

```mermaid
flowchart TB
    Client --> Web[Cloudflare Workers Static Assets]
    Client --> API[Cloudflare Worker]
    API --> HD[Hyperdrive] --> Neon[(Neon)]
    API --> R2[(R2)]
    API --> DO[Durable Objects]
    API --> Mailgun[Mailgun]
    API --> SQS[SQS]
    SQS --> Lambda[Python worker Lambda]
    Lambda --> Neon
    Lambda --> R2
```

## デプロイ単位

| 対象 | 方法 |
|---|---|
| frontend | Cloudflare Workers Static Assets + GitHub Actions CD |
| API | `cd apps/api && npm run deploy` |
| DB | `DATABASE_URL=... npm run db:migrate` |
| worker | container image を ECR へ push し Lambda image を更新 |
| Cloudflare binding | Wrangler (`wrangler.jsonc`) |
| Hyperdrive cache / R2 CORS | 手動承認付き `cloudflare-resources.yml` |
| AWS worker infrastructure | Terraform |
| ドキュメント | 関連する変更が`main`へ入り、CIが成功すると、GitHub Actions CDが両言語をCloudflare Worker `videoq-docs`へ公開 |

上のコマンドは各作業の入口です。本番のAPI・worker・DBは `.github/workflows/cd.yml` の手順と順序も確認します。
新しい列を使うコードを先に公開すると、古いDBに対して動かなくなる場合があります。

詳細は [`infra/DEPLOY.md`](https://github.com/yukiharada1228/videoq/blob/main/infra/DEPLOY.md) を参照してください。
文書サイトは専用のWorkerから [docs.videoq.jp](https://docs.videoq.jp/) で公開し、日本語は [/ja/](https://docs.videoq.jp/ja/) です。本文・翻訳・サイト設定の変更は、`main`のCI成功後に自動公開します。`npm run deploy:docs`で現在の作業ツリーを手動公開することもできます。[文書サイトのデプロイ手順](https://github.com/yukiharada1228/videoq/blob/main/apps/docs/README.md)を参照してください。
