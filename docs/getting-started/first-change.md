---
title: 最初の変更を進める
description: 小さな画面変更で、編集・確認・レビュー依頼の流れを体験する。
---

# 最初の変更を進める

最初の変更には、担当タスクに関係する文言の改善や小さな表示修正が向いています。このページでは「タグを作る画面の説明文を改善する」を例に、作業の進め方を説明します。練習のためだけに機能の仕様を変える必要はありません。

## 1. 変更前に完了条件を決める

例えば「タグの用途が初めての人に伝わり、日本語と英語の両方で表示が崩れない」を完了条件にします。現在の画面と、関連するStorybookの表示を確認してから編集します。

```bash
git status --short
git switch -c docs/improve-tag-help
```

すでに作業ブランチがある場合はそのブランチを使います。未完了の変更がある場合は、今回の作業と混ざらないように確認してください。

## 2. 表示と文言の場所を探す

```bash
rg --files apps/web/src | rg 'TagCreateDialog|useTags'
rg -n 'tag|タグ' apps/web/src/i18n/locales
```

表示はコンポーネント、翻訳文言は `apps/web/src/i18n/locales/ja/translation.json` と `en/translation.json` にあります。両言語で同じキーを使います。

フォームの説明だけを直すなら、APIやDBを変更する必要はありません。APIへの入力も変える場合は[APIを変更する](../guides/api.md)で影響範囲を確認します。

## 3. 利用者が見る状態を確認する

```bash
npm run storybook
```

[http://127.0.0.1:6006](http://127.0.0.1:6006)を開きます。日本語・英語、モバイル・デスクトップを切り替え、長い文言やエラー表示も確認します。実際の画面で操作を試す場合は、[開発環境](local-setup.md)の `web-dev` を使います。

## 4. 変更に合った確認をする

```bash
npm run typecheck --workspace @videoq/web
npm run lint --workspace @videoq/web
npm run build --workspace @videoq/web
```

操作や状態を変えた場合は、その挙動を確かめる既存テスト・Storyも更新します。文言だけの変更なら、同じ文言を比較するだけのテストを増やすより、表示確認を重視します。[テストの使い分け](../guides/testing.md)も参照してください。

## 5. レビューで判断できる状態にする

差分を読み、今回の変更以外が入っていないか確認します。

```bash
git diff --check
git diff
```

レビュー依頼には「何に困っていたか」「どう変わるか」「何を確認したか」を記載します。画面の変更なら、変更後の画像やStory名もあると伝わります。利用者の手順が変わった場合は、同じ変更で文書も更新します。

**次に読む:** 担当範囲に合わせて[画面](../guides/frontend.md)、[API](../guides/api.md)、[DB](../guides/database.md)、[動画処理](../guides/worker.md)のガイドへ進みます。
