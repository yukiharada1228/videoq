---
title: DBを変更する
description: Drizzleの定義からmigrationを生成し、ローカルDBに適用する手順。
---

# DBを変更する

DBの変更は、TypeScriptで書いたDrizzleのスキーマ定義から始めます。**migration** は、既存のDBを新しい構造に進めるための変更履歴です。

前提: [ローカル環境](../getting-started/local-setup.md)のPostgreSQLが起動していること。以下は自分の開発DBに対する手順です。

## 定義の場所

| 場所 | 内容 |
|---|---|
| `apps/api/src/db/schema/modern.ts` | 動画・講座・チャット・PLOGなどの業務データ |
| `apps/api/src/db/schema/better-auth.ts` | セッション・認証・OAuthなど |
| `apps/api/src/db/schema/index.ts` | スキーマ定義の集約 |
| `apps/api/drizzle/` | 生成したSQLとスキーマ変更の履歴 |

`modern` はファイル名です。新しいテーブルを別のモデル定義に重複して追加せず、このスキーマを基準にします。

## 列やテーブルを変更する

1. スキーマ定義を変更します。
2. 既存行に値がある場合の扱いを決めます。必須列の追加では既定値やデータ補完が必要になる場合があります。
3. migrationを生成し、差分を確認します。

```bash
npm run db:generate -- --name describe_the_schema_change
npm run db:check
npm run db:verify
```

生成されたSQL・snapshot・journalは手で書き換えません。修正が必要なら、スキーマ定義と生成手順を見直します。`db:verify` は生成履歴とSQLの整合性などを検査します。

## ローカルに適用する

標準構成の接続先を明示する例です。認証情報を変更した場合は合わせてください。

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres npm run db:migrate
```

適用後は、変更した列を読み書きするAPIとworkerの両方を確認します。APIはDrizzleを使いますが、Python workerには同じテーブルを読むSQLもあります。

## データだけを変更する場合

既存行の値を補完する処理はcustom migrationを使います。

```bash
npm run db:generate:custom -- --name describe_the_data_change
```

生成したcustom migrationの先頭に `-- drizzle-kit:custom` を記載します。ここにはデータ補完を書き、テーブル・列・indexなどの構造変更は書きません。

## 確認する

スキーマ変更は、型チェックに加えて検証専用DBでの統合テストを実行します。[テストの使い分け](testing.md)を参照してください。共有環境や本番では `drizzle-kit push` を使わず、レビュー済みmigrationをデプロイ手順に沿って適用します。

埋め込みモデルの変更は、設定値だけではDBのベクトル次元を変更しません。現行の `scene_embeddings.embedding` は1536次元です。

**関連:** [データ辞書](../database/data-dictionary.md)、[ER図の読み方](../database/er-diagram.md)。
