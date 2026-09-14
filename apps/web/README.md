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
カタログにはチャットの回答・本文・検索進捗・入力欄、動画アップロードのフォーム・ボタン、
認証フォーム・入力欄、エラー・通知バナー、読み込み状態、確認ダイアログ・トーストを収録しています。
動画カード・一覧、タグバッジ・選択・絞り込み、処理状態バッジも、件数やタグの量を固定して確認できます。
チャット一覧・履歴は、長い会話、末尾だけの回答待ち、投稿者、評価の各状態、CSV出力中を収録しています。
分析ダッシュボード・評価サマリー・時系列グラフ・フィードバック円グラフも、空データや値の偏りを再現できます。
Controlsでpropsを変更でき、Actionsで送信・評価・動画引用・確認結果などのコールバックを確認できます。
フォームの入力はストーリー内の状態に反映し、送信しても認証・アップロード・AIへの通信は発生しません。

`Common/FeedbackProvider`は実際のProviderを使い、Canvasで確認ダイアログや通知を開きます。
ボタンで再表示でき、Controlsで確認文言や通知の配列を変更すると状態をリセットします。
通知は通常`durationMs: 0`で表示を保持し、`AutoDismiss`で1秒後の自動消去を確認します。
`ConfirmWithKeyboard`、`CancelConfirmation`、`DismissWithKeyboard`は操作後の状態を表示します。
フォームでは`KeyboardSubmit`と`KeyboardInput`で入力・フォーカス・送信を検証します。

`Chat/ChatMessagesView`はストーリーごとにスクロール用refとフィードバック状態を作成します。
`LongConversation`の先頭・末尾ボタンで固定高の会話欄をスクロールでき、Controlsの`height`で高さを変更できます。
`AwaitingLastResponse`は以前の空の回答に待機表示が出ないこと、`FeedbackUpdating`は更新対象だけの操作無効化を検証します。
`Chat/ChatHistoryView`の日時は固定ISO文字列を閲覧環境のタイムゾーン・アプリの選択言語で表示します。
`MissingMetrics`は未取得の指標と0%を区別し、`KeyboardExportAndCitation`はCSVと引用をキーボードで操作します。
CSV出力はモックコールバックの記録のみで、ファイルはダウンロードしません。

`Dashboard/`はAPI接続なしで固定日付・集計値を切り替えます。`EvaluationLoading`ではグラフを表示したまま評価のみ読み込み中にします。
グラフの親に幅を設定し、実際の`ResponsiveContainer`で高さ220pxのSVGを描画します。
`NarrowContainer`と`EnglishNarrow`は親幅280px、`NinetyDays`は90日分のデータを使用します。
`KeyboardTooltip`はフォーカス後の矢印キー操作、時系列グラフではEnterでの開閉も検証します。
円グラフのキーボード操作には[Recharts 3.8.1の修正](https://github.com/recharts/recharts/pull/7140)を使用します。
`HoverTooltip`は円グラフのマウス操作、`AllZeroHidden`は全件0で非表示になることを確認します。
初回のブラウザテスト中に依存の最適化で再読み込みされないよう、`vitest.storybook.ts`でRechartsを事前に最適化します。

ストーリーは対象コンポーネントと同じディレクトリの`*.stories.tsx`に追加します。
共有データは`.storybook/fixtures/`に置き、API由来の型には`import type`を使います。
画像・動画が必要な場合も小さな固定のローカルfixtureを使い、外部メディアに依存させません。
動画カードは`.storybook/fixtures/media/`の2秒のWebMを使用し、YouTubeの固定IDのサムネイル要求を
MSWで捕捉してローカルのSVGを返します。`HoverPreview`で動画の再生・停止、`YouTube`で画像の読み込みを検証します。
MSWはStorybook専用の`.storybook/public/mockServiceWorker.js`を使用します。MSW更新時は
`npm exec --workspace @videoq/web -- msw init .storybook/public --save`でworkerも更新してください。
メディアモックの設定は[Storybookのネットワークモック手順](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-network-requests)に従います。
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
