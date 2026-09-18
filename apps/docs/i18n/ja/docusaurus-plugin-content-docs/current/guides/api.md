---
title: APIを変更する
description: tRPCの入力・出力からHonoのハンドラー、サービス、DBまで変更を追う。
---

# APIを変更する

通常のJSON APIは、`packages/trpc` の共有契約から変更します。HonoはHTTPの受け口を担当し、実際の処理をAPI側のハンドラーにつなぎます。

Honoのドキュメントにある `hc` を使ったRPCとは別に、このプロジェクトでは **tRPC** を使っています。入口は `/api/trpc` です。

## 編集しながら動作を見る

[開発環境](../getting-started/local-setup.md)を起動しておきます。ComposeのAPIにはソースコードがマウントされ、Wranglerの開発サーバーが変更を読み込みます。リクエストの結果とログを合わせて確認します。

```bash
docker compose logs -f api
```

依存関係やDockerの構成を変更した場合は、必要に応じてAPIのイメージを再ビルドします。

## 例: タグ作成の入力を追う

`packages/trpc/src/inputs/tags.ts` では、タグ作成の入力が次のように定義されています。

```ts
"tags.create": z.object({
  name: z.string().min(1).max(50),
  color: tagColorSchema.default("gray"),
}),
```

これは既存定義の抜粋です。`name` は1〜50文字、色の省略時は `gray` になります。値の検証と既定値がここで決まります。

## 変更する順番

1. **入力を定義する。** `packages/trpc/src/inputs/` で、受け取る値・制約・既定値を決めます。
2. **出力を定義する。** `outputs.ts` / `model-schemas.ts` で、呼び出し側に返す形を確認します。
3. **操作を登録する。** `routers/` でqueryまたはmutationと、必要な認証を選びます。
4. **APIへつなぐ。** `apps/api/src/trpc/handlers/` で入力と利用者IDをサービスに渡します。
5. **業務処理を書く。** `features/<機能>/service.ts` に処理の組み立て、`repositories/` にDBアクセスを置きます。
6. **画面の呼び出しを更新する。** 関連フックやコンポーネントを変更し、取得結果の再表示まで確認します。

新しい操作や分野を増やす場合は、共有routerの集約と `trpc/context.ts` のハンドラー登録も確認します。[タグ一覧を追う例](../getting-started/codebase.md)が入口になります。

## 権限をどこで確認するか

`protectedProcedure` はログインを確認しますが、それだけでは対象動画・タグの所有権までは保証しません。既存実装のように、サービスやrepositoryへ利用者IDを渡し、検索範囲を絞ります。

テストでは正常入力だけでなく、不正入力、未ログイン、他人のデータ、存在しないIDも確認します。[認証とアクセス権](../concepts/auth.md)も参照してください。

## Honoのrouteを使う場面

認証、MCP、Stripe webhook、動画バイナリ、multipartアップロード、チャットのSSE、CSV出力などは、通常のJSON呼び出しとは形式が異なります。これらは `features/*/routes.ts` と `app.ts` で組み立てます。

通常の一覧・取得・更新を追加するときは、まず既存のtRPC routerを確認してください。

## 確認する

```bash
npm run typecheck
npm run test:api
```

`typecheck` は画面側を含めた契約の不整合も検出します。APIのテストはNode.jsの単体テストとWorkers実行環境のテストを含みます。DB統合テストには別途検証用DBが必要です。[テストの使い分け](testing.md)に実行条件をまとめています。

**関連:** [tRPC APIの詳細設計](../architecture/trpc-api.md)、[DBを変更する](database.md)。
