結論として、Django 6.0.7 は Cookie とヘッダをそれぞれ独立に「32文字 secret または64文字 masked token」として受理し、両方を32文字 secret に正規化して定数時間比較します。Cookie/ヘッダ文字列の単純一致では、Cookie 32文字・ヘッダ64文字の既存フローを壊します。

調査対象の `.venv` は Django 6.0.7、DRF 3.17.1 です。設定ファイル先頭の「Django 5.2.7 で生成」というコメントより、実際にインストールされている実装を優先しています。

## 1. Cookie・ヘッダの形式

定数は [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:44) で次のとおりです。

```text
CSRF_SECRET_LENGTH = 32
CSRF_TOKEN_LENGTH  = 64
CSRF_ALLOWED_CHARS =
  abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
```

`string.ascii_letters` は小文字→大文字の順で、その後に数字が続きます。この順序は mask/unmask のインデックス計算に使われるため、変更できません。

Cookie、POSTフォーム値、`X-CSRFToken` はいずれも次のどちらかだけが有効です。

- 32文字: unmasked secret
- 64文字: `mask[32] + cipher[32]` の masked token
- 使用可能文字: ASCII英数字のみ
- 空白、`-`、`_`、`=`、改行、前後空白などはすべて不正
- trim・大文字小文字変換・URLデコードなどは検証関数内で行わない

形式検証は [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:130) の `_check_token_format()` です。

### 現行の発行フロー

[csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:96) の `get_token()` は、Cookie由来の32文字 secret に毎回ランダムな32文字 mask を適用し、64文字 masked token を返します。一方、レスポンスCookieには通常32文字 secret が保存されます。

VideoQ のCSRF bootstrap endpointも [views.py](/Users/yukiharada/dev/videoq/backend/app/presentation/auth/views.py:288) で以下の形になっています。

- `csrftoken` Cookie: 32文字 secret
- JSONレスポンスの `csrftoken`: 64文字 masked token

したがって既存フロントでは次の両方が発生します。

- same-origin: Cookieを読み、Cookie 32文字をヘッダにも設定 → `32 / 32`
- cross-origin: JSON本文の64文字をヘッダに設定し、ブラウザがCookie 32文字を送信 → `32 / 64`

旧Djangoが発行した64文字のmasked Cookieも [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:221) で互換処理されます。そのため、理論上は `32/32`、`32/64`、`64/32`、`64/64` のすべてが有効になり得ます。

なお、現在の実装には `_get_token()` という関数はなく、発行が `get_token()`、Cookie抽出・正規化が `_get_secret()` です。

## 2. mask / unmask と検証手順

mask処理は [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:59) です。

各文字を `CSRF_ALLOWED_CHARS` 上のインデックスに変換し、長さ62の環上で加算します。

```text
cipher[i] = ALLOWED_CHARS[
  (index(secret[i]) + index(mask[i])) mod 62
]

maskedToken = mask + cipher
```

unmaskは [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:71) です。

```text
mask   = token[0:32]
cipher = token[32:64]

secret[i] = ALLOWED_CHARS[
  (index(cipher[i]) - index(mask[i])) mod 62
]
```

Pythonでは負の添字が末尾からのインデックスになるため `chars[x - y]` で動きます。TypeScriptでは負数をそのまま `% 62` に渡すと負の値になるため、必ず次の形にします。

```ts
(cipherIndex - maskIndex + 62) % 62
```

固定テストベクトルは以下です。

```text
secret = abcdefghijklmnopqrstuvwxyzABCDEF
mask   = 0123456789abcdefghijklmnopqrstuv

token  =
0123456789abcdefghijklmnopqrstuv02468acegikmoqsuwyACEGIKMOQSUWY0
```

この64文字 token をunmaskすると元のsecretになります。

### `_check_token` 相当の順序

[csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:349) の処理順は次のとおりです。

1. Cookieがなければ拒否。
2. Cookieが32/64文字かつ英数字だけか検証。
3. Cookieが64文字ならunmaskし、32文字 `cookieSecret` にする。
4. POSTの場合、空でない `csrfmiddlewaretoken` フォーム値を優先。
5. フォーム値が空、またはPATCH/DELETE等なら `X-CSRFToken` を使用。
6. リクエストtokenが32/64文字かつ英数字だけか検証。
7. リクエストtokenが64文字ならunmaskし、32文字 `requestSecret` にする。
8. `requestSecret` と `cookieSecret` を定数時間比較。

Djangoの定数時間比較は `secrets.compare_digest()` に委譲されています。

## 3. VideoQ の設定と認証クラス

プロジェクトで明示されていない項目はDjango既定値です。

| 設定 | 実効値 |
|---|---|
| `CSRF_COOKIE_NAME` | `csrftoken` |
| `CSRF_HEADER_NAME` | `HTTP_X_CSRFTOKEN` |
| 実HTTPヘッダ | `X-CSRFToken`。大文字小文字は区別しない |
| `CSRF_USE_SESSIONS` | `False` |
| `CSRF_COOKIE_HTTPONLY` | `False`、明示設定 |
| `CSRF_COOKIE_DOMAIN` | `None` |
| `CSRF_COOKIE_PATH` | `/` |
| 開発時 `CSRF_COOKIE_SECURE` | `False` |
| 本番時 `CSRF_COOKIE_SECURE` | `True` |
| 開発時 `CSRF_COOKIE_SAMESITE` | `Lax` |
| 本番時 `CSRF_COOKIE_SAMESITE` | `None` |

条件付きCookie設定は [settings.py](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:508)、Django既定値は [global_settings.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/conf/global_settings.py:565) にあります。

`CSRF_TRUSTED_ORIGINS` は空ではなく、[settings.py](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:513) で `CORS_ALLOWED_ORIGINS` と同じ値です。現在の開発環境の実効値は次の2つです。

```text
http://localhost:3000
http://127.0.0.1:3000
```

`CORS_ALLOWED_ORIGINS` 環境変数がある場合はカンマ区切りで置き換えられます。

### `CookieJWTAuthentication.enforce_csrf`

[authentication.py](/Users/yukiharada/dev/videoq/backend/app/presentation/common/authentication.py:112) の挙動は次のとおりです。

- Bearerヘッダ認証を先に試し、成功した場合はCSRF検証しない。
- Bearerがなく、有効な `access_token` Cookieで認証した場合だけCSRFを適用。
- `GET`、`HEAD`、`OPTIONS` は早期return。
- `TRACE` は `CSRFCheck` 内でsafeとして受理。
- Cookie認証されたPOST/PATCH/PUT/DELETE等では、DRFの `CSRFCheck` を実行。
- `CSRFCheck` はDjangoの `CsrfViewMiddleware` を継承し、拒否レスポンスの代わりに理由文字列を返すだけです。
- `process_request()` に続けて `process_view(request, None, ...)` を呼ぶため、Origin/Refererチェックも実際に走ります。
- 失敗時は `PermissionDenied("CSRF Failed: ...")`。

## 4. Worker用のDjango互換TS擬似コード

現在の `@cloudflare/workers-types` とCloudflare Workersは、非標準拡張の `crypto.subtle.timingSafeEqual()` を提供しています。[Cloudflare公式Web Crypto資料](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#timingsafeequal)

```ts
const CSRF_SECRET_LENGTH = 32;
const CSRF_TOKEN_LENGTH = 64;

const CSRF_ALLOWED_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const VALID_CSRF_CHARS = /^[a-zA-Z0-9]+$/;
const textEncoder = new TextEncoder();

function hasValidCsrfFormat(value: string): boolean {
  return (
    (value.length === CSRF_SECRET_LENGTH ||
      value.length === CSRF_TOKEN_LENGTH) &&
    VALID_CSRF_CHARS.test(value)
  );
}

function unmaskCipherToken(token: string): string {
  if (
    token.length !== CSRF_TOKEN_LENGTH ||
    !VALID_CSRF_CHARS.test(token)
  ) {
    throw new TypeError("Invalid masked CSRF token");
  }

  const mask = token.slice(0, CSRF_SECRET_LENGTH);
  const cipher = token.slice(CSRF_SECRET_LENGTH);
  const alphabetLength = CSRF_ALLOWED_CHARS.length; // 62

  let secret = "";

  for (let i = 0; i < CSRF_SECRET_LENGTH; i += 1) {
    const cipherIndex = CSRF_ALLOWED_CHARS.indexOf(cipher[i]);
    const maskIndex = CSRF_ALLOWED_CHARS.indexOf(mask[i]);

    // 事前の文字検証済みなので通常は -1 にならない。
    if (cipherIndex < 0 || maskIndex < 0) {
      throw new TypeError("Invalid CSRF token character");
    }

    const secretIndex =
      (cipherIndex - maskIndex + alphabetLength) % alphabetLength;

    secret += CSRF_ALLOWED_CHARS[secretIndex];
  }

  return secret;
}

function normalizeCsrfValue(value: string): string | undefined {
  if (!hasValidCsrfFormat(value)) {
    return undefined;
  }

  return value.length === CSRF_TOKEN_LENGTH
    ? unmaskCipherToken(value)
    : value;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);

  // 有効なCSRF値は正規化後どちらも32 bytesなので通常は通らない。
  // timingSafeEqualへ異なる長さを渡さないための防御。
  if (aBytes.byteLength !== bBytes.byteLength) {
    crypto.subtle.timingSafeEqual(aBytes, aBytes);
    return false;
  }

  return crypto.subtle.timingSafeEqual(aBytes, bBytes);
}

export function verifyDjangoCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined,
): boolean {
  // Djangoと同様、trimや正規化はしない。
  if (cookieToken === undefined || headerToken === undefined) {
    return false;
  }

  const cookieSecret = normalizeCsrfValue(cookieToken);
  if (cookieSecret === undefined) {
    return false;
  }

  const requestSecret = normalizeCsrfValue(headerToken);
  if (requestSecret === undefined) {
    return false;
  }

  return constantTimeStringEqual(requestSecret, cookieSecret);
}
```

mask発行ロジックも必要なら次の形です。実際の `mask` は `crypto.getRandomValues()` とrejection samplingを使い、62文字から偏りなく32文字生成します。単純な `randomByte % 62` は分布に偏りが出ます。

```ts
function maskCipherSecret(secret: string, mask: string): string {
  if (
    secret.length !== CSRF_SECRET_LENGTH ||
    mask.length !== CSRF_SECRET_LENGTH ||
    !VALID_CSRF_CHARS.test(secret) ||
    !VALID_CSRF_CHARS.test(mask)
  ) {
    throw new TypeError("Invalid CSRF secret or mask");
  }

  let cipher = "";

  for (let i = 0; i < CSRF_SECRET_LENGTH; i += 1) {
    const secretIndex = CSRF_ALLOWED_CHARS.indexOf(secret[i]);
    const maskIndex = CSRF_ALLOWED_CHARS.indexOf(mask[i]);

    cipher += CSRF_ALLOWED_CHARS[
      (secretIndex + maskIndex) % CSRF_ALLOWED_CHARS.length
    ];
  }

  return mask + cipher;
}
```

## 5. Origin / Referer の扱い

Djangoと同等にするなら、token比較だけでなく [csrf.py](/Users/yukiharada/dev/videoq/backend/.venv/lib/python3.14/site-packages/django/middleware/csrf.py:414) のチェックも必要です。順序はOrigin/Refererチェックが先、tokenチェックが後です。

- `Origin` がある場合:
  - リクエスト先の `scheme://host[:port]` と完全一致、または
  - `CSRF_TRUSTED_ORIGINS` の完全一致、または
  - 設定されたschemeとワイルドカードサブドメインに一致
- `Origin` がなくリクエストがHTTPSの場合:
  - `Referer` 必須
  - 絶対URLであること
  - `https:` であること
  - trusted originのhost、`CSRF_COOKIE_DOMAIN`、または現在のhostに一致
- HTTPでOriginがない場合はRefererチェックなし

PoCでもsame-siteとsame-originを同一視しない方が安全です。

- フロントとWorkerが本当にsame-originなら、`Origin === new URL(request.url).origin` を要求。
- `app.example.com` → `api.example.com` のようなsame-site・cross-originなら、`https://app.example.com` を明示的なtrusted originに追加。
- 「同じeTLD+1ならすべて許可」のような判定にはしない。
- `Origin` がないHTTPSリクエストでは厳格なRefererフォールバックを実装。
- CORS許可はCSRF Origin検証の代用にならないため、両方を行う。

Honoでは、Bearer/APIキーではなくCookie認証が選択されたときだけ、非安全メソッドに対して次の順で適用すれば現在のDjangoフローと一致します。

```ts
verifyOriginOrReferer(request, trustedOrigins);
verifyDjangoCsrfToken(
  getCookie(c, "csrftoken"),
  c.req.header("X-CSRFToken"),
);
```

ファイル変更は行っていません。