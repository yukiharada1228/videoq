---
title: 画面を変更する
description: Reactのページ、翻訳、データ取得、Storybookの変更場所と確認方法。
---

# 画面を変更する

画面の変更は、表示を担当するコンポーネントと、データを取得するフックを分けて考えると追いやすくなります。前提は[開発環境](../getting-started/local-setup.md)の起動です。

## 編集内容からファイルを選ぶ

| 変更したいこと | 主な場所 |
|---|---|
| URLと画面の対応 | `apps/web/src/App.tsx` |
| ページの表示 | `apps/web/src/pages/`、`components/` |
| データの取得・更新 | `apps/web/src/hooks/` |
| 日本語・英語の文言 | `apps/web/src/i18n/locales/` |
| APIの型と操作 | `packages/trpc/src/` |
| 読み込み中・失敗・空状態の見本 | 対象の `*.stories.tsx` |

## 開発サーバーを使う

Composeの `web-dev` を使うか、ホストで次を実行します。両方ともポート3000を使うため、どちらか一方を選びます。

```bash
VITE_API_URL=/api VITE_USE_S3_STORAGE=true npm run dev:web
```

ホストのViteは通常、APIを `127.0.0.1:8787` に転送します。APIやDBはComposeで起動しておきます。

## データ取得は既存フックから読む

タグ一覧なら `useTags.ts` に次の呼び出しがあります。

```tsx
const tagsQuery = useQuery(
  trpc.tags.list.queryOptions({ limit: 100, offset: 0 }),
);
```

これはフック内での利用例です。TanStack Queryが取得結果・読み込み中・エラーの状態を管理し、tRPCが入力と出力の型を共有します。更新後は既存実装に合わせてキャッシュを更新するか、再取得します。

## ページを追加するとき

通常画面は `App.tsx` の `appPageRoutes` に追加し、`handle` で選択中のナビゲーションやレイアウト種別を指定します。ログイン関連は `AuthRouteLayout`、共有講座は専用の構成です。

ページ側は本文を返します。共通ヘッダーやフッターをページごとに追加すると二重表示になるため、親レイアウトに任せます。

## 確認する

```bash
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm run build --workspace @videoq/web
```

表示・操作はStorybookと実画面で確認します。成功時だけでなく、読み込み中・失敗・データが空の状態も扱います。手順は [Storybookの変更・レビュー](https://github.com/yukiharada1228/videoq/blob/main/apps/web/STORYBOOK.md)を参照してください。

**関連:** [画面遷移](../requirements/screen-transition-diagram.md)、[テストの使い分け](testing.md)。
