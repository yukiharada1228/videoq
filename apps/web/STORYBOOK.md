# Storybookの変更・レビュー手順

UIの表示状態や操作を変更するときは、対象部品のStoryも同じPRで更新します。起動方法と各カタログのモック仕様は[Frontend README](README.md#storybook)を参照してください。

## 1. 対象のStoryを探す

コマンドはリポジトリのルートで実行します。

```bash
rg --files apps/web/src -g '*.stories.ts' -g '*.stories.tsx'
npm run storybook
```

Storybookの検索から部品を選び、変更前の状態・操作を確認します。Storyは対象部品と同じディレクトリにあります。

| 変更内容 | Storyで扱う内容 |
|---|---|
| 見た目・文言・レイアウト | 影響する既存Storyを更新し、長文・狭い幅も確認する。 |
| 入力・選択・ダイアログ | 操作前後の状態、キーボード操作、フォーカス、無効状態を確認する。 |
| 取得・保存・非同期処理 | 通常・空・保留・失敗と、必要な再試行／完了後の状態を用意する。 |
| 不具合修正 | 修正前の問題を再現するStoryを選ぶか追加し、利用者から見える結果を検証する。 |
| APIや内部ロジックのみ | 関連する既存テストで検証する。UIの状態・操作に影響する場合はStoryも更新する。 |

既存Storyで確認できる状態は再利用します。すべてのpropsの組み合わせを機械的に追加する必要はありません。

## 2. 既存の部品とモックを使う

実際のアプリと同じ部品をimportします。Story専用に画面を複製せず、propsで表現できる状態は固定データとモックcallbackで作ります。

| 実装の参考 | ファイル |
|---|---|
| props・入力・callback | [ChatComposer](src/components/chat/ChatComposer.stories.tsx) |
| ダイアログ・キーボード・フォーカス復帰 | [TagCreateDialog](src/components/video/TagCreateDialog.stories.tsx) |
| 認証・Query・tRPC・RESTの基本 | [ApiMocks](src/lib/ApiMocks.stories.tsx) |
| 状態を持つAPIモック・保存後の反映 | [PlogPanel](src/components/video/detail/PlogPanel.stories.tsx)、[Plogモック](.storybook/mocks/plog.ts) |
| SSEの進捗・完了・中断 | [ChatPanel](src/components/chat/ChatPanel.stories.tsx)、[SSEモック](.storybook/mocks/chatPanel.ts) |
| 実際のDnD context・並べ替え | [SortableVideoItem](src/components/video/course-detail/SortableVideoItem.stories.tsx) |

- 共有データは[fixtures](.storybook/fixtures/)に置き、API由来の型は`import type`で参照します。日時・ID・入力文は固定します。
- QueryやAPIに依存する部品は[共通モック](.storybook/mocks/network.ts)を利用します。`success`・`pending`・`failure`で状態を作り、必要なprocedureを登録します。
- `parameters.api.auth`で認証状態を指定します。共通decoratorが提供するRouter・Query・認証・通知Providerの使い方は[READMEのAPIモック手順](README.md#認証api依存のストーリー)を参照してください。
- 共有Query cacheを使うAPI依存のDocsは`parameters.docs.story.inline: false`にします。
- モックの一覧・試行回数は`beforeEach`で初期化します。独自のtimer・listener・ストリームは終了時に解除し、再実行や別Storyへの切り替えでも同じ結果にします。

実API・外部メディアへの未登録リクエストは共通MSWが遮断します。通信エラーが出たら必要なモックを追加します。認証情報や実データはfixtureに入れません。

`play`では`canvas.getByRole`などで利用者が操作する要素を選び、`userEvent`で操作して結果を確認します。非同期の画面反映は`findByRole`や`waitFor`で待ちます。固定時間の待機はポーリング間隔など、時間自体を検証する場合に使います。

Rechartsの扇形はアニメーション中にDOM要素が置き換わるため、要素数だけを待っても操作対象が安定したとは限りません。[FeedbackDonutChartのホバーStory](src/components/dashboard/FeedbackDonutChart.stories.tsx)では、そのStory内だけ`prefers-reduced-motion`を再現し、ライブラリが対応している「動きを減らす」表示で操作を検証します。他のメディアクエリーは元のブラウザーへ渡し、終了時に設定を戻します。通常のアニメーションは別のStoryで維持し、固定sleepや待機時間の延長だけで不安定さを隠さないでください。

## 3. 変更した範囲を検証する

初回はREADMEの手順で依存関係とChromiumを準備します。まず対象ファイルを指定して、変更したStoryの失敗を確認しやすくします。

```bash
npm run test:storybook -- src/components/chat/ChatComposer.stories.tsx
```

ファイルの引数は`apps/web`からの相対パスです。対象ファイルの各Storyと`play`が実際のChromiumで実行されます。

表示・操作に関係する変更では、Canvasでも次の点を確認します。

- 日本語と英語、DesktopとMobile、長い文言・空データなど影響する状態。
- Tabでの移動、Enter／Spaceでの操作、ダイアログの開閉、処理中と失敗後のフォーカス。
- 保存中の二重操作・キャンセル制御と、失敗後に入力が保持されるか。
- Storyの再実行・切り替え後に、前のモックや通信・選択状態が混ざらないか。

翻訳辞書とCSSはアプリと共通です。fixtureの文章は言語切り替えだけでは翻訳されないため、内容も確認する場合は英語fixtureを使います。

共通のCSS・Provider・モック・依存関係など、他のStoryへ影響する変更では全Storyを実行します。アプリやhookのロジックを変えた場合は関連ユニットテストも実行します。

```bash
npm run test:storybook
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm run build:storybook
```

ユニットテストは`npm test --workspace @videoq/web`、アプリのビルドは`npm run build --workspace @videoq/web`です。既存テストとStoryで同じ内部実装を重複して検証せず、それぞれの変更に必要な確認を行います。

## 4. PRで確認結果を共有する

PRには具体的な変更前後の挙動と実行した検証結果を書きます。UI変更では対象のStory名・ファイルを記載し、見た目の確認に役立つ場合はスクリーンショットも添えます。追加・更新が不要なら、既存のどのStoryで確認できるか、またはUIに影響しない理由を記載します。

レビュアーは[CI](../../.github/workflows/ci.yml)の`Frontend Storybook`で静的ビルドとChromiumテストの結果を確認できます。同じPRの`Frontend Lint & Type Check`・`Frontend Tests`・`Frontend Build`も確認します。対象外の変更ではパス条件によりjobがスキップされます。

静的版は成功したCI runのArtifactsにある`frontend-storybook`から取得できます。保持期間は7日です。ダウンロードして展開したディレクトリで次を実行し、表示されたローカルURLを開きます。

```bash
python3 -m http.server 6007 --bind 127.0.0.1
```

`index.html`の直接オープンではなく、HTTPで配信してください。確認後はCtrl+Cでサーバーを停止します。

## 失敗したとき

| 症状 | 確認すること |
|---|---|
| Chromiumが見つからない | READMEの`playwright install chromium`を実行したか。 |
| 未登録のAPI／外部URLのエラー | 必要なhandlerがあるか、認証fixtureとprocedureが一致しているか。意図的な失敗Storyのエラーは、そのStoryの仕様と照合する。 |
| モジュールの読み込みに失敗する | テストのログに依存の再最適化が出ていないか。新しい依存が原因なら、[Vitest設定](vitest.storybook.ts)の`optimizeDeps.include`を確認する。 |
| 操作直後のassertionが不安定 | 通信開始・完了や画面更新を待っているか。固定sleepやタイムアウトの延長だけで回避しない。 |
| 次のStoryだけ失敗する | Query・モック・timer・listenerの初期化とcleanupが揃っているか。 |

## アクセシビリティ検査

次の6部品はStoryのmetaで`parameters.a11y.test: 'error'`を指定しています。既存の`test:storybook`とCIの`Frontend Storybook`で自動検査が実行され、違反があれば失敗します。同じファイルに追加したStoryにも適用されます。

| 対象 | Story |
|---|---|
| 通知・確認ダイアログ | [FeedbackProvider](src/components/common/FeedbackProvider.stories.tsx)、[MessageAlert](src/components/common/MessageAlert.stories.tsx) |
| 読み込み・処理状態 | [LoadingState](src/components/common/LoadingState.stories.tsx)、[StatusBadge](src/components/common/StatusBadge.stories.tsx) |
| フォーム・認証エラー | [FormField](src/components/auth/FormField.stories.tsx)、[ErrorMessage](src/components/auth/ErrorMessage.stories.tsx) |

この範囲だけを検証する場合は次を実行します。

```bash
npm run test:storybook -- src/components/common src/components/auth/FormField.stories.tsx src/components/auth/ErrorMessage.stories.tsx
```

それ以外は[共通設定](.storybook/preview.tsx)の`test: 'todo'`を継承し、違反を報告する段階です。対象を広げるときは、その部品のmetaに`parameters: { a11y: { test: 'error' } }`を追加し、各Storyの表示・操作後の状態を検証して問題を修正します。検査を通すためだけにルールを無効化したり、`todo`へ戻したりせず、必要な例外は理由・再現Story・対応Issueを記録してください。設定の詳細は[Storybook公式ドキュメント](https://storybook.js.org/docs/writing-tests/accessibility-testing)を参照してください。

自動検査の成功だけではアクセシビリティの確認完了にはなりません。Accessibilityパネルの手動確認が必要な項目（Incomplete）と、キーボード操作・フォーカス・読み上げを確認してください。操作途中の状態も、検証したい状態で終了するStoryを用意して確認します。
