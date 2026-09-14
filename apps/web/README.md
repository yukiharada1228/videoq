# VideoQ Frontend

React、TypeScript、Viteで構築したVideoQのフロントエンドです。

## 開発

```bash
cd ../..
npm ci
npm run dev:web
```

主な確認コマンド：

```bash
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm test --workspace @videoq/web
npm run build --workspace @videoq/web
```

## Storybook

Node.js 22.12以降を推奨します。repository rootで実行します。

```bash
npm ci
npm run storybook          # http://127.0.0.1:6006
npm run build:storybook    # apps/web/storybook-static
npm exec --workspace @videoq/web -- playwright install chromium
npm run test:storybook     # Chromiumで全ストーリーとplayの操作を検証
```

ツールバーで日本語／英語とMobile（390px）／Desktop（1280px）を切り替えられます。
初期カタログはチャットの回答・本文・検索進捗・入力欄と、動画アップロードのフォーム・ボタンです。
Controlsでpropsを変更でき、Actionsで送信・評価・動画引用などのコールバックを確認できます。
フォームの入力はストーリー内の状態に反映し、送信してもアップロードやAIへの通信は発生しません。

ストーリーは対象コンポーネントと同じディレクトリの`*.stories.tsx`に追加します。
共有データは`.storybook/fixtures/`に置き、API由来の型には`import type`を使います。
画像・動画が必要な場合も小さな固定のローカルfixtureを使い、外部メディアに依存させません。
翻訳は実際のアプリの辞書・CSSを使用します。入力する文やサンプル回答は固定データなので、言語切替で自動翻訳されません。

共通decoratorはMemoryRouterとI18nextProviderを用意します。
ルート依存の部品には`parameters: { pathname: '/videos/7' }`を指定できます。
英語では`/en`のprefixと`:locale`を付け、日本語では実アプリ同様にprefixを付けません。
API依存の画面に必要なReact Query・認証・tRPC/RESTモックは後続Issue #911で整備します。

`npm test`と`test:coverage`は既存のjsdomテスト（unit project）を実行します。
Storybookは独立したbrowser projectとして実行し、`vitest.setup.ts`のAPIモックを流用しません。
`typecheck`はアプリとStorybookをそれぞれ検査します。
CIでは静的ビルドとChromiumでのストーリー検証を実行します。
Accessibilityパネルは既存の問題を報告する設定で、現時点ではアクセシビリティ違反をCIの失敗条件にはしていません。

## API client

SPA 内部の型付き API は `@videoq/trpc` の `AppRouter` を共有し、
`/api/trpc` へ接続します。`src/main.tsx` の `QueryClientProvider` でキャッシュを共有し、
`src/lib/trpc.ts` に client と `@trpc/tanstack-react-query` の options proxy を定義します。
画面とhookは `useQuery(trpc.*.queryOptions(input))` /
`useMutation(trpc.*.mutationOptions())` を使います。`src/lib/api.ts` は
SSE、multipart / direct upload、CSV、media URL、Better Authのように
tRPCでは表現しないprotocol専用adapterだけを持ちます。

## Cloudflare Pages

Git連携のビルド設定は次の値を使用します。

| 設定 | 値 |
|---|---|
| ルートディレクトリ | `apps/web` |
| ビルドコマンド | `npm run build` |
| ビルド出力 | `dist` |
| ビルド監視パス | `apps/web/*`, `packages/trpc/*`, `package.json`, `package-lock.json` |

依存関係はrepository rootのnpm workspaceと`package-lock.json`で管理します。
Cloudflare Pages側のルートディレクトリを変更した場合も、上記の監視パスを同期してください。

## Digital Agency UI

使用中のコンポーネントだけを同期します。

```bash
npm run ui:check # dry-run
npm run ui:sync  # 同期
```

対象は `scripts/sync-digital-agency-ui.mjs` で管理します。
