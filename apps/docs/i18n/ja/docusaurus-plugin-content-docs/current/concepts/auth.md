---
title: 認証とアクセス権
description: ブラウザのCookieセッション、共有講座、MCP連携での権限確認を理解する。
---

# 認証とアクセス権

**認証**は「誰が操作しているか」、**認可**は「その人がこのデータを操作してよいか」の確認です。ログインできることと、他の人の動画を読めることは別です。

## 入口によって認証方法が違う

| 入口 | 使う仕組み | 主な用途 |
|---|---|---|
| ブラウザ | Better AuthのCookieセッション | ログイン、プロフィール、通常のtRPC API |
| MCPクライアント | APIキーまたはOAuth | 外部ツールから動画・講座を操作する |
| 公開共有リンク | 共有トークンと講座の公開状態などを確認 | 共有された講座を利用する |

MCPは、AIアシスタントなどの外部クライアントがツールを呼び出すためのプロトコルです。接続先は `/api/mcp` です。

## ブラウザでログインするとき

1. ログイン画面が `/api/auth/*` のBetter Authへ情報を送ります。
2. 認証が成功すると、セッションを表すCookieが設定されます。
3. 以後のAPI呼び出しにもCookieを送り、API側で利用者を確認します。

React側のログイン判定は `useSession`、プロフィールの取得は `account.me` を使います。通常のブラウザAPI用に独自のアクセストークン更新処理を追加する必要はありません。

## tRPCでの確認

| procedure | 入口で確認すること |
|---|---|
| `publicProcedure` | ログインを一律には要求しない。共有トークンなどの確認は処理ごとに行う |
| `protectedProcedure` | ブラウザのログインセッション |
| `adminProcedure` | 管理者権限 |

その後、サービスやDB問い合わせでも所有者・講座へのアクセス範囲を確認します。API変更時は「自分のデータでは成功し、権限のない他人のデータでは失敗する」を確認します。

定義は [packages/trpc/src/init.ts](https://github.com/yukiharada1228/videoq/blob/main/packages/trpc/src/init.ts)、リクエストとの接続は [trpc/context.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/trpc/context.ts)にあります。

## MCPでの確認

APIキーは設定画面で管理します。OAuthでは利用者がクライアントへのアクセスを許可し、`videoq.read` / `videoq.write` などの範囲で操作します。ブラウザのセッションとMCPのトークンを同じものとして扱わないでください。

## 設定名で迷ったら

- `BETTER_AUTH_SECRET`: Better Auth用の秘密鍵。ホスト実行・本番の設定で使用。
- `AUTH_JWT_SECRET`: Compose起動スクリプトが転送する互換設定。現在のブラウザ認証方式を表す名前ではない。
- `USER_SECRET_ENCRYPTION_KEY`: 利用者が保存した外部APIキーを暗号化・復号する鍵。セッションの秘密鍵とは用途が異なる。

**次に読む:** [APIを変更する](../guides/api.md)。通信の順番は[シーケンス図](../design/sequence-diagram.md)でも確認できます。
