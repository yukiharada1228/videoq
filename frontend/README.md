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

- ユーザー登録 (`/signup`)
- ログイン (`/login`)
- JWT認証によるセッション管理
- レスポンシブデザイン

## 使用技術

- **Next.js 16** - React フレームワーク
- **TypeScript** - 型安全な開発
- **Tailwind CSS** - ユーティリティファーストのCSS フレームワーク
- **shadcn/ui** - 高品質なUIコンポーネントライブラリ

## ディレクトリ構造

```
frontend/
├── app/              # Next.js App Router
│   ├── login/        # ログインページ
│   ├── signup/       # サインアップページ
│   └── page.tsx      # ホームページ
├── components/       # Reactコンポーネント
│   └── ui/           # shadcn/uiコンポーネント
├── lib/              # ユーティリティ
│   ├── api.ts        # APIクライアント
│   └── utils.ts      # 共通ユーティリティ関数
└── public/           # 静的ファイル
```

## バックエンドとの連携

このフロントエンドは Django REST Framework で実装されたバックエンドAPIと連携します。

### APIエンドポイント

- `POST /api/auth/signup/` - ユーザー登録
- `POST /api/auth/login/` - ログイン
- `POST /api/auth/refresh/` - トークンリフレッシュ
- `GET /api/auth/me` - 現在のユーザー情報

### CORS設定

バックエンドの `settings.py` で以下のCORS設定が必要です：

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True
```

## ビルド

```bash
npm run build
```

## 本番環境でのデプロイ

本番環境では以下の手順を実行してください：

1. 環境変数 `NEXT_PUBLIC_API_URL` を本番環境のAPI URLに設定
2. `npm run build` でビルド
3. `npm start` で本番サーバーを起動
