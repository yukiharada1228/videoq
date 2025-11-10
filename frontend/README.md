# Ask Video Frontend

Next.js + TypeScript + Tailwind CSS + shadcn/ui を使用したフロントエンドアプリケーションです。

## セットアップ

### 必要な環境
- Node.js 18以上
- npm または yarn

### インストール

```bash
npm install
```

### 環境変数の設定

`.env.local` ファイルを作成して、以下の内容を追加してください：

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

## 機能

- ユーザー登録・メール認証 (`/signup`, `/verify-email`)
- ログイン・ログアウト (`/login`)
- パスワードリセット (`/forgot-password`, `/reset-password`)
- 動画アップロード・管理 (`/videos`)
- 動画グループ管理 (`/videos/groups`)
- AIチャット機能（RAG対応）
- 共有リンク機能 (`/share/[token]`)
- ユーザー設定 (`/settings`)
- JWT認証によるセッション管理
- レスポンシブデザイン

## 使用技術

- **Next.js 16** - React フレームワーク
- **React 19** - UIライブラリ
- **TypeScript** - 型安全な開発
- **Tailwind CSS 4** - ユーティリティファーストのCSS フレームワーク
- **Radix UI** - アクセシブルなUIコンポーネントプリミティブ
- **shadcn/ui** - 高品質なUIコンポーネントライブラリ
- **react-hook-form** - フォーム状態管理
- **zod** - スキーマバリデーション
- **@dnd-kit** - ドラッグ&ドロップ機能
- **Playwright** - E2Eテスト

## 国際化 (i18n)

- 画面テキストはすべて [i18next](https://www.i18next.com/) + `react-i18next` で管理しています。デフォルト言語は英語 (`en`) で、ブラウザ設定・`lang` クエリ・ローカルストレージ・Cookie の順に自動検出して日本語 (`ja`) へ切り替わります。
- ルートレイアウトで `I18nProvider` をラップしているため、アプリケーション内では `const { t } = useTranslation();` を呼び出して `t('translation.key')` で文言を取得してください。
- React コンポーネント以外（ユーティリティや API ラッパーなど）で翻訳が必要な場合は `import { initI18n } from '@/i18n/config';` を用いて i18next インスタンスを初期化し、`initI18n().t(...)` を利用します。
- 翻訳文字列は `frontend/i18n/locales/en/translation.json`（英語）と `frontend/i18n/locales/ja/translation.json`（日本語）に定義しています。新しいキーを追加する際は、両言語ファイルを同時に更新してください。
- ドキュメントルートの `<html>` タグは初期表示時に `lang="en"` を宣言し、クライアントでの言語判定後に `I18nProvider` が自動的に `document.documentElement.lang` を更新します。

## ディレクトリ構造

```
frontend/
├── app/                      # Next.js App Router
│   ├── page.tsx              # ホームページ
│   ├── login/                 # ログインページ
│   ├── signup/                # サインアップページ
│   │   └── check-email/       # メール確認待ちページ
│   ├── verify-email/          # メール認証ページ
│   ├── forgot-password/      # パスワードリセット要求ページ
│   ├── reset-password/        # パスワードリセットページ
│   ├── settings/              # 設定ページ
│   ├── videos/                # 動画関連ページ
│   │   ├── page.tsx          # 動画一覧ページ
│   │   ├── [id]/             # 動画詳細ページ
│   │   └── groups/            # 動画グループページ
│   │       └── [id]/         # 動画グループ詳細ページ
│   └── share/                 # 共有ページ
│       └── [token]/          # 共有トークンページ
├── components/                # Reactコンポーネント
│   ├── auth/                  # 認証コンポーネント
│   ├── video/                 # 動画関連コンポーネント
│   ├── chat/                  # チャットコンポーネント
│   ├── layout/                # レイアウトコンポーネント
│   ├── common/                # 共通コンポーネント
│   └── ui/                    # UIコンポーネント（shadcn/ui）
├── hooks/                     # カスタムフック（useAuth, useVideos, useAsyncState等）
├── lib/                       # ライブラリ・ユーティリティ（api, errorUtils等）
├── e2e/                       # Playwright E2Eテスト
├── public/                    # 静的ファイル
├── package.json               # Node.js依存関係
├── Dockerfile                 # フロントエンドDockerイメージ
└── README.md                  # このファイル
```

## バックエンドとの連携

このフロントエンドは Django REST Framework で実装されたバックエンドAPIと連携します。

### APIエンドポイント

#### 認証
- `POST /api/auth/signup/` - ユーザー登録（メール認証が必要）
- `POST /api/auth/verify-email/` - メール認証
- `POST /api/auth/login/` - ログイン
- `POST /api/auth/logout/` - ログアウト
- `POST /api/auth/refresh/` - トークンリフレッシュ
- `GET /api/auth/me/` - 現在のユーザー情報
- `PATCH /api/auth/me/` - ユーザー情報更新（OpenAI APIキー保存等）
- `POST /api/auth/password-reset/` - パスワードリセット要求
- `POST /api/auth/password-reset/confirm/` - パスワードリセット確認

#### 動画管理
- `GET /api/videos/` - 動画一覧取得
- `POST /api/videos/` - 動画アップロード
- `GET /api/videos/<id>/` - 動画詳細取得
- `PATCH /api/videos/<id>/` - 動画情報更新
- `DELETE /api/videos/<id>/` - 動画削除

#### 動画グループ
- `GET /api/videos/groups/` - グループ一覧取得
- `POST /api/videos/groups/` - グループ作成
- `GET /api/videos/groups/<id>/` - グループ詳細取得
- `PATCH /api/videos/groups/<id>/` - グループ更新
- `DELETE /api/videos/groups/<id>/` - グループ削除
- `POST /api/videos/groups/<id>/videos/` - 動画をグループに追加
- `POST /api/videos/groups/<id>/share/` - 共有リンク作成
- `GET /api/videos/groups/shared/<token>/` - 共有グループ情報取得

#### チャット
- `POST /api/chat/` - チャット送信
- `GET /api/chat/history/` - チャット履歴取得
- `GET /api/chat/history/export/` - チャット履歴エクスポート
- `POST /api/chat/feedback/` - チャットフィードバック送信

### CORS設定

バックエンドの `settings.py` で以下のCORS設定が必要です（環境変数 `CORS_ALLOWED_ORIGINS` で設定可能）：

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True
```

**注意:** このプロジェクトはDocker Composeを使用することを前提として設計されています。Docker環境では、Nginxがリバースプロキシとして動作し、フロントエンドとバックエンドを統合します。

## ビルド

```bash
npm run build
```

## テスト

### E2Eテスト（Playwright）

```bash
# E2Eテストの実行
npm run test:e2e

# E2Eテスト（UIモード）
npm run test:e2e:ui

# E2Eテスト（ヘッドモード）
npm run test:e2e:headed

# テストレポートの表示
npm run test:e2e:report
```

## Docker環境での開発

このプロジェクトはDocker Composeを使用することを前提としています。詳細はプロジェクトルートのREADME.mdを参照してください。

```bash
# Docker環境でのコマンド実行例
docker-compose exec frontend npm run build
docker-compose exec frontend npm run test:e2e
docker-compose logs -f frontend
```

## 本番環境でのデプロイ

本番環境では以下の手順を実行してください：

1. 環境変数 `NEXT_PUBLIC_API_URL` を本番環境のAPI URLに設定
2. `npm run build` でビルド
3. `npm start` で本番サーバーを起動

または、Docker Composeを使用してデプロイします。
