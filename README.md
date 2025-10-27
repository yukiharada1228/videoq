# Ask Video

動画に関する質問を扱うアプリケーションです。

## プロジェクト構成

```
ask-video/
├── backend/          # Django REST Framework バックエンド
├── frontend/         # Next.js + TypeScript + Tailwind CSS フロントエンド
└── README.md         # このファイル
```

## セットアップ

### バックエンド（Django）

バックエンドのセットアップと起動については、`backend/README.md` を参照してください。

```bash
cd backend
# 仮想環境の作成と依存関係のインストール
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# データベースマイグレーション
python manage.py migrate

# 開発サーバーの起動
python manage.py runserver
```

バックエンドは http://localhost:8000 で起動します。

### フロントエンド（Next.js）

フロントエンドのセットアップと起動については、`frontend/README.md` を参照してください。

```bash
cd frontend

# 依存関係のインストール
npm install

# 環境変数の設定
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api" > .env.local

# 開発サーバーの起動
npm run dev
```

フロントエンドは http://localhost:3000 で起動します。

## 使用技術

### バックエンド
- Django 5.2.7
- Django REST Framework
- JWT 認証（django-rest-framework-simplejwt）
- SQLite

### フロントエンド
- Next.js 16
- TypeScript
- Tailwind CSS
- shadcn/ui

## 機能

- ユーザー登録・ログイン機能
- JWT 認証によるセッション管理
- レスポンシブデザイン

## 開発

### バックエンドの API エンドポイント

- `POST /api/auth/signup/` - ユーザー登録
- `POST /api/auth/login/` - ログイン
- `POST /api/auth/refresh/` - トークンリフレッシュ
- `GET /api/auth/me` - 現在のユーザー情報

### CORS 設定

開発環境では、フロントエンド（localhost:3000）からバックエンドAPIにアクセスできるようにCORSが設定されています。

## ライセンス

このプロジェクトは MIT ライセンスのもとで公開されています。
