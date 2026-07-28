# VideoQ Frontend

React、TypeScript、Viteで構築したVideoQのフロントエンドです。

## 開発

```bash
npm install
npm run dev
```

主な確認コマンド：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Digital Agency UI

使用中のコンポーネントだけを同期します。

```bash
npm run ui:check # dry-run
npm run ui:sync  # 同期
```

対象は `scripts/sync-digital-agency-ui.mjs` で管理します。
