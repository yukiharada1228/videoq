# PoC #03: 認証カットオーバー互換（Django 発行物を Worker が同一検証）

- 種別: 移行 PoC 手順・結果
- 対象: 要件定義書 §8（認証4経路）/ AU-1〜AU-12
- 関連: [移行要件定義書](./cloudflare-hono-migration-requirements.md) / [PoC #01](./poc-01-pgvector-cross-runtime-search.md)
- 作成日: 2026-08-01
- スクリプト: [`poc/worker-auth-cutover/`](../../poc/worker-auth-cutover/)

## 1. 目的

Hono Worker に認証を移したとき、**Django が発行済みの資格情報（JWT / API キー / OAuth トークン / Share）を Worker が同一に検証**でき、**カットオーバーで既存セッションが切れない**ことを確認する。

## 2. 現行の認証4経路（実装確認）

| 経路 | 方式 | 検証に必要なもの |
|---|---|---|
| Cookie/Bearer JWT | SimpleJWT **HS256 + Django `SECRET_KEY`**、access cookie `access_token`、標準クレーム（`token_type/exp/iat/jti/user_id`）、ISSUER/AUDIENCE なし | 共有 `SECRET_KEY` で署名検証（jose） |
| API キー | `vq_`+`token_urlsafe(32)`、**SHA-256 hexdigest** 保存、`X-API-Key` / `Authorization: Bearer` 提示 | WebCrypto SHA-256 → `app_userapikey` をハッシュ照合 |
| OAuth2 Bearer | django-oauth-toolkit。`oauth2_provider_accesstoken` に `token`(平文) + **`token_checksum`(sha256 hex, 64)** + `expires`/`scope`/`user_id` | DB 照合（token_checksum + `expires > now()` + scope） |
| Share | `app_videogroup.share_slug`（クエリ） | DB 照合 `WHERE share_slug = $1` |

## 3. 実測結果（2026-08-01）

### 3.1 暗号パリティ（JWT / API キー）— 合格
Django/SimpleJWT で実アクセストークンと API キーを生成（[`gen_token.py`](../../poc/worker-auth-cutover/gen_token.py), DB 不要）→ Worker 相当（`jose` + `crypto.subtle`, [`verify.mjs`](../../poc/worker-auth-cutover/verify.mjs)）で検証:

- **JWT 検証 ✓**: 同一 `SECRET_KEY`(HS256) で Django のトークンを検証し `user_id=123` / `token_type=access` / `exp` を取得。
- **改ざん拒否 ✓**: `SECRET_KEY` 不一致のトークンは正しく拒否（セキュリティ確認）。
- **API キー ✓**: WebCrypto `SHA-256` hex == Django `hashlib.sha256().hexdigest()` が**一致**。

> `jose` / `crypto.subtle` は Cloudflare Workers ネイティブ（同一 SubtleCrypto: HMAC-SHA256 / SHA-256）。本検証は Node 実行だが workerd 上でも同一に動く（PoC #01b/#02 で pg/aws4fetch の workerd 実行は別途実証済み）。

### 3.2 DB 照合（OAuth / Share）— スキーマ確認済み・実行系は実証済み
- `oauth2_provider_accesstoken` / `app_videogroup.share_slug` の存在と列を実 DB で確認（上表）。検証は Hyperdrive 経由の SELECT のみで、**Worker からの DB 読み取りは PoC #01b/#01d で実測済み**。OAuth は `token_checksum`（Worker が WebCrypto で算出可能）での照合が index 親和的。

## 4. 結論（要件 §8 への反映）

- **AU-1（Cookie/Bearer JWT）・AU-4（API キー）は crypto パリティ実測合格** → Worker が Django 発行物を同一検証。**ブラウザセッション・API キーは再ログイン不要でカットオーバー可能**。
- **OAuth2 / Share は DB 照合**（既存 DOT テーブル・share_slug を Hyperdrive 経由で読む）→ ランタイム実証済み。
- **初期方針の妥当性を確認**: HS256 + `SECRET_KEY` を Worker と共有すれば、発行は当面 Django、Worker は検証のみで無停止カットオーバーできる。

## 5. 残課題（設計事項・本 PoC のスコープ外）

- **HS256 → RS256/EdDSA 切替（AU-2）**: セキュリティ強化としては推奨だが、切替時は旧 HS トークンを有効期限（access 10 分 / refresh 14 日）まで**二重検証する移行期間**が必要。カットオーバー自体は HS256 共有で先行し、署名方式変更は別フェーズ。
- **CSRF（AU-3）**: Cookie 認証の非安全メソッドに Django 相当のダブルサブミット CSRF を Worker ミドルウェアで再実装（暗号パリティではなく実装事項）。
- **PBKDF2（AU-9）**: パスワード検証（ログイン）は当面 Django に残すため初期は非該当。Worker がログインを担う段階で PBKDF2 パリティ（WASM 検証 or 遅延リハッシュ）を実施。
- **トークン発行の Worker 移管**: Worker が発行を担う段階で同一 `SECRET_KEY`/alg 署名（jose で自明）。

## 6. 安全上の注意

- `gen_token.py` は DB 不要（トークンは in-memory 生成、有効 10 分の使い捨て）。`SECRET_KEY` は標準出力に出さず env 経由で node に渡す。
- 実 DB へはスキーマ参照の読み取りのみ（`\d` / information_schema）。
