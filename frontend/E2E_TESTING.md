# E2Eテストガイド

## 概要

フロントエンドのE2E（End-to-End）テストはPlaywrightを使用して実装されています。

## インストール

```bash
cd frontend
npm install
npx playwright install
```

## テストの実行

### すべてのテストを実行

```bash
npm run test:e2e
```

### UIモードでテストを実行

テストを実行しながら視覚的に確認できます：

```bash
npm run test:e2e:ui
```

### ヘッド付きモードで実行

ブラウザを表示しながらテストを実行します：

```bash
npm run test:e2e:headed
```

### 特定のテストファイルのみ実行

```bash
npx playwright test e2e/video-groups.spec.ts
```

### 特定のブラウザでテストを実行

```bash
npx playwright test --project=chromium
```

## テスト構成

### テストファイル

1. **`e2e/video-groups.spec.ts`**
   - グループ一覧ページの表示
   - グループ作成
   - グループ詳細ページのアクセス
   - ローディング状態の確認

2. **`e2e/auth.spec.ts`**
   - ログインページの表示
   - ユーザー名とパスワードの入力

3. **`e2e/videos.spec.ts`**
   - 動画一覧ページのアクセス
   - ホームページの統計情報表示

## 設定ファイル

`playwright.config.ts`で以下の設定が行われています：

- **baseURL**: `http://localhost:3000`
- **テストディレクトリ**: `./e2e`
- **webServer**: 開発サーバーを自動起動
- **リトライ**: CI環境で2回までリトライ
- **スクリーンショット**: 失敗時のみ保存

## テストの前提条件

### テスト用アカウント

テストでは以下の認証情報を使用します：

```typescript
username: 'testuser'
password: 'testpass123'
```

### バックエンドサーバー

バックエンドAPIサーバーが起動している必要があります：

```bash
# バックエンドディレクトリで
cd ../backend
python manage.py runserver
```

### フロントエンドサーバー

フロントエンド開発サーバーは自動的に起動されますが、手動で起動する場合：

```bash
cd frontend
npm run dev
```

## CI/CDでの実行

GitHub ActionsなどのCI/CDパイプラインで実行する場合：

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
          npx playwright install --with-deps
      - name: Run E2E tests
        run: |
          cd frontend
          npm run test:e2e
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

## トラブルシューティング

### テストが失敗する場合

1. **サーバーが起動していない**
   ```bash
   # バックエンド
   cd backend && python manage.py runserver
   
   # フロントエンド
   cd frontend && npm run dev
   ```

2. **認証情報が間違っている**
   テスト用のアカウントがデータベースに存在することを確認してください。

3. **タイムアウトエラー**
   タイムアウト時間を調整する場合、`playwright.config.ts`を編集：
   ```typescript
   use: {
     baseURL: 'http://localhost:3000',
     timeout: 30000, // 30秒
   }
   ```

### デバッグ

テストをステップ実行しながら確認：

```bash
npx playwright test --debug
```

ヘッド付きモードで実行：

```bash
npm run test:e2e:headed
```

## テストレポート

テストレポートを確認：

```bash
npm run test:e2e:report
```

## 今後の改善

- [ ] より詳細なテストケースの追加
- [ ] ビジュアルリグレッションテスト
- [ ] パフォーマンステストの追加
- [ ] クロスブラウザテストの拡張

