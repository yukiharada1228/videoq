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

ツールバーで日本語／英語とMobile（390px）／Tablet（1024px）／Desktop（1280px）を切り替えられます。
カタログにはチャットの回答・本文・検索進捗・入力欄、動画アップロードのフォーム・ボタン、
認証フォーム・入力欄、エラー・通知バナー、読み込み状態、確認ダイアログ・トーストを収録しています。
動画カード・一覧、タグバッジ・選択・絞り込み、処理状態バッジも、件数やタグの量を固定して確認できます。
チャット一覧・履歴は、長い会話、末尾だけの回答待ち、投稿者、評価の各状態、CSV出力中を収録しています。
分析ダッシュボード・評価サマリー・時系列グラフ・フィードバック円グラフも、空データや値の偏りを再現できます。
タグ作成・講座作成ダイアログでは、入力・プレビュー・作成中・失敗後の再試行を確認できます。
ページヘッダー、ログイン状態別のナビゲーション、OAuth接続アプリの一覧・解除も収録しています。
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

`Video/TagCreateDialog`と`Video/VideoCourseCreateModal`はボタンから実際のダイアログを開きます。
`KeyboardCreate`では入力・タグの色選択・送信・起点へのフォーカス復帰、`CancelAndReopen`では入力の初期化を検証します。
`Creating`は`onCreate`を保留して入力と閉じる操作の無効状態を維持します。ストーリーを再実行すると初期化できます。
`CreateFailed`は講座作成のエラーを表示し、`FailureThenRetry`は初回失敗・再試行成功を実行ごとに設定します。
タグ作成の失敗は現仕様どおりconsole出力のみで、フォームの値を保って再試行できます。
`EscapeRequest`のplayはネイティブの`cancel`イベントを使って閉じる要求を検証します。CanvasではEscapeキーも操作できます。
API通信は行わず、作成内容と閉じるコールバックをActionsで確認できます。

`Layout/AppPageHeader`はタイトル・説明・バッジ・アクションの有無、長文、日本語／英語のスマホ表示を確認します。
`Layout/AppNav`は未ログイン・一般ユーザー・管理者、各ページの選択状態、メニュー・言語切替を再現します。
幅1280px未満ではメニュー内にリンクとログアウトをまとめ、`EnglishAdministratorTablet`で1024pxの操作ボタンが画面内に収まることを検証します。
開閉には[W3Cのdisclosure navigationパターン](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)を使い、
Tabでリンクを移動し、Escapeで閉じて起点へフォーカスを戻します。言語選択後も起点へ戻ります。
`Logout`はMSWで成功を返してログイン画面の代替表示へ遷移し、`LogoutPending`は保留中の無効化を確認します。
認証fixture自体は固定です。ストーリー終了時には言語のlocalStorage設定を復元します。

`Auth/ConnectedAppsSection`は実際のBetter Auth clientを使い、同意一覧・公開クライアント名・解除のREST応答をMSWで返します。
日付は固定ISO値を選択言語・閲覧環境のタイムゾーンで表示します。現在のadapterは有効期限を常にnullへ変換するため、期限なしの「—」を収録しています。
`LongContentMobile`は長いアプリ名・scopeの表を横スクロールし、`EnglishMobile`は英語の表示を確認します。
`RevokePending`と`RefetchPending`では解除開始から一覧の再取得完了まで全解除ボタンを無効化します。
`RevokeSucceeded`で対象だけの削除、`FailureThenRetry`で失敗後の再試行、`KeyboardRevokeLastApp`で最後の1件を削除した後の結果へのフォーカスを検証します。
再実行時は`beforeEach`で同意一覧と試行回数を作り直します。実際の接続解除は発生しません。

ストーリーは対象コンポーネントと同じディレクトリの`*.stories.tsx`に追加します。
共有データは`.storybook/fixtures/`に置き、API由来の型には`import type`を使います。
画像・動画が必要な場合も小さな固定のローカルfixtureを使い、外部メディアに依存させません。
動画カードは`.storybook/fixtures/media/`の2秒のWebMを使用し、YouTubeの固定IDのサムネイル要求を
MSWで捕捉してローカルのSVGを返します。`HoverPreview`で動画の再生・停止、`YouTube`で画像の読み込みを検証します。
MSWはStorybook専用の`.storybook/public/mockServiceWorker.js`を使用します。MSW更新時は
`npm exec --workspace @videoq/web -- msw init .storybook/public --save`でworkerも更新してください。
メディアモックの設定は[Storybookのネットワークモック手順](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-network-requests)に従います。
翻訳は実際のアプリの辞書・CSSを使用します。入力する文やサンプル回答は固定データなので、言語切替で自動翻訳されません。

共通decoratorはMemoryRouter・I18nextProviderと、アプリのtRPC options proxyが参照する
`appQueryClient`を渡したQueryClientProviderを用意します。
ルート依存の部品には`parameters: { pathname: '/videos/7' }`を指定できます。
英語では`/en`のprefixと`:locale`を付け、日本語では実アプリ同様にprefixを付けません。
`parameters.api`を指定したストーリーにはAuthProvider・FeedbackProviderも追加します。

### 認証・API依存のストーリー

`Foundation/ApiMocks`は実際の`useAuth`・TanStack Query・tRPC transport・`apiClient`を使う最小の利用例です。
成功、空、保留、失敗、一般ユーザー／管理者／未ログイン、更新操作と再試行、日本語／英語・スマホ幅・長文を収録しています。
`MixedBatchAndInputs`はGETとPOSTの複数procedure、入力の対応、成功・失敗の混在（HTTP 207）を検証します。
`KeyboardMutation`はTab・Enterでの更新と共有キャッシュの反映、`MutationPending`は更新中の無効状態を確認します。
`RestMutation`ではBetter AuthのRESTを通したAPIキー作成を固定値で再現します。
`UnmockedRequestsBlocked`は未登録のAPI GET/POST・外部画像・tRPCが遮断されることを確認し、意図的にMSWエラーをconsoleへ出します。

モック境界は[Storybookのmodule mock](https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-modules)とMSWです。
`authSession.ts`の2つの読み取り関数だけを`sb.mock`で置き換え、Better Authのセッション購読・cookieに依存しない表示を作ります。
sessionと`account.me`は`.storybook/fixtures/auth.ts`の同じfixtureから設定します。
`account.me`を個別に上書きせず、`authFixtures.loggedOut / user / admin`または`authFixture(profile)`を指定してください。
未ログインではsessionがnull、`account.me`を直接呼ぶと401になります。ログイン・ログアウトの状態遷移自体はこのfixtureの対象外です。
RESTのAPIキー処理などは本物のBetter Auth clientを通し、応答だけをMSWで返します。
tRPCは[公式HTTP仕様](https://trpc.io/docs/rpc)に沿ってbatchの入出力とエラーを再現します。

```tsx
import { authFixtures } from '../../../.storybook/fixtures/auth';
import { tagPage } from '../../../.storybook/fixtures/api';
import { success, pending, failure, trpcQuery, restGet } from '../../../.storybook/mocks/network';

export const Loaded = {
  parameters: {
    pathname: '/videos',
    api: {
      auth: authFixtures.user,
      trpc: [trpcQuery('tags.list', success(tagPage))],
      rest: [restGet('/api/auth/api-key/list', success({ apiKeys: [] }))],
    },
    docs: { story: { inline: false, height: '520px' } },
  },
};
// 読み込み中: trpcQuery('tags.list', pending())
// エラー:     trpcQuery('tags.list', failure('取得できませんでした', 500))
// 空:         success({ data: [], meta: { total: 0, limit: 100, offset: 0 } })
```

`trpcQuery` / `trpcMutation`はprocedure名と入出力をAppRouterの型で検査します。
固定応答のほか、`trpcMutation('tags.create', input => success({ ...tagFixture, ...input }))`のように入力を使えます。
RESTは`restGet` / `restPost`と通常のMSW `http.get` / `http.post`等を`api.rest`または`beforeEach({ msw })`で登録できます。
`restPost('/api/auth/sign-out', pending())`のように更新リクエストも終了時に解放される保留応答を使えます。
回数によって応答を変える場合は`RestFailureThenRetry`のようにカウンターとhandlerを`beforeEach`内で作り直してください。
既存の画像用`parameters.msw`とも併用できます。

Storybookとbrowser projectでは`VITE_API_URL`を`/api`、S3直接送信を無効に固定し、実環境の設定を継承しません。
未定義のAPI・書き込み・外部URLへのリクエストはMSWがエラーにして遮断します。ローカルの表示用assetは読み込めます。
未登録tRPC procedureもエラーになるため、必要な操作は明示的にモックしてください。
各ストーリーの開始・終了時にqueryのキャンセルとcacheのclear、認証mock・handlerのリセットを行います。
保留応答は長時間timerを作らず、リクエストabortまたはストーリー終了で解放します。
コンポーネントのpolling・購読はunmountで解除されます。ストーリー独自のtimer・listenerは`beforeEach`の戻り値で必ず解除してください。
アプリと同じsingleton cacheを使うため、API依存のDocsは上記の`inline: false`でiframeごとに分離します。
SSEの段階的応答はChatPanelのIssue #915で追加します。

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
