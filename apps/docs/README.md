# VideoQ Docs

Docusaurus 3 のドキュメントサイトです。文書はリポジトリ直下の `docs/` を直接読み込みます。
このディレクトリにはサイトの設定、スタイル、静的アセットだけを置きます。

## 起動・ビルド

Node.js 22.12 以上を使用し、リポジトリルートで実行してください。

```bash
npm ci
npm run dev:docs
# http://localhost:3001

npm run typecheck --workspace @videoq/docs
npm run build:docs
npm run preview:docs
# http://localhost:3001
```

`dev:docs` と `preview:docs` は同じポートを使うので、切り替える際は先に起動した方を停止します。
API、DB、Docker の起動は不要です。

## 文書の編集

- 本文は `docs/**/*.md` を編集します。新しい文書は `sidebars.ts` に読み進める順番で登録します。
- サイドバーは「はじめる」「基本を理解する」「開発ガイド」「設計リファレンス」「運用」と用語集に分かれています。文書の種類だけでなく、読者の目的に合わせて配置します。
- `.md` は通常の Markdown、`.mdx` は React コンポーネントを埋め込める MDX として処理します。
- 図は `mermaid` コードブロックを使用します。
- `docs/` 内の文書リンクは相対パスの `.md` リンクを使用します。
- `apps/`、`infra/` などサイト外のファイルには GitHub の `blob/main/` / `tree/main/` URL を使用します。
- 日本語・英語の全文検索はビルド時に索引を生成します。検索の確認には `build:docs` → `preview:docs` を使います。外部検索サービスの契約や API キーは不要です。

CI は文書とサイト設定の変更を検出し、型チェック、ビルド、リンク・アンカー切れの検証を実行します。
生成物は `documentation-build` artifact に保存されます。

## 静的ホスティング

ビルド設定:

| 項目 | 値 |
|---|---|
| 作業ディレクトリ | リポジトリルート |
| インストール | `npm ci --workspace @videoq/docs` |
| ビルドコマンド | `npm run build:docs` |
| 公開ディレクトリ | `apps/docs/build` |
| Node.js | 22.12 以上 |

`DOCS_URL` は公開先のオリジン、`DOCS_BASE_URL` はパスです。ビルド時に指定します。
既定値は `https://docs.videoq.jp` と `/` ですが、ドメインや公開先を作成する設定ではありません。
ホスティング先に合わせて変更してから公開してください。

```bash
DOCS_URL=https://example.com DOCS_BASE_URL=/videoq/ npm run build:docs
```

`apps/docs/build` の内容を静的ホストへ配置します。サブパスで公開するときは `DOCS_BASE_URL` の先頭と末尾に `/` を付けます。
ブログ、翻訳版、ドキュメントのバージョン分岐は初期構成では無効です。
