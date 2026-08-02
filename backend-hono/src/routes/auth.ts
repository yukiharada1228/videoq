import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { requireAuth, apiKeyMethod, jwtMethod } from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  getCurrentUser,
  authenticateUser,
  emailExists,
  createInactiveUser,
  requestAccountDeletion,
  getUserForToken,
  getUserForEmailChange,
  findActiveUserByEmail,
  activateUser,
  setUserPassword,
  setPendingEmail,
  confirmPendingEmail,
  getSearchApiKeyStatus,
  setSearchApiKey,
  deleteSearchApiKey,
} from "../repositories/user-repository";
import { enqueueAccountDeletion } from "../lib/jobs";
import {
  checkDjangoToken,
  checkEmailChangeToken,
  decodeUidToPk,
} from "../lib/django-token";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { fernetEncrypt } from "../lib/fernet";
import { validateDjangoPassword } from "../lib/password-validators";
import {
  buildVerificationLink,
  sendVerificationEmail,
  buildPasswordResetLink,
  sendPasswordResetEmail,
  buildEmailChangeLink,
  sendEmailChangeConfirmation,
} from "../lib/auth-email";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  existsActiveApiKeyName,
} from "../repositories/api-key-repository";
import { issueCsrfToken } from "../utils/csrf";
import { issueTokenPair, verifyRefreshToken } from "../lib/jwt";
import { charField } from "../utils/drf-fields";
import { apiError, drfValidationError } from "../utils/responses";
import {
  clientIp,
  enforceThrottles,
  normalizeThrottleIdent,
  throttledResponse,
} from "../lib/rate-limit";
import type { AppEnv } from "../types/bindings";

/**
 * 認証・アカウント系のうち **Worker へ移行済み**のルートのみを定義する。
 * ここに無い /api/auth/* は app.ts のプロキシで既存 Django に流れる（ストラングラーフィグ）。
 * 移行済みルートの一覧と契約は README の「移行済みルート」表を参照。
 */
export const authRoutes = new Hono<AppEnv>();

// CsrfTokenView（GET, PublicAPIView）: csrftoken cookie を設定し body でも token を返す。
// 既存 cookie の secret を再利用（無ければ新規）。cookie は Django CSRF_COOKIE_* に一致。
const csrf = (c: Context<AppEnv>) => {
  const existing = getCookie(c, "csrftoken");
  const { secret, token } = issueCsrfToken(existing);
  const secure = c.env.ENVIRONMENT === "production"; // SECURE_COOKIES=IS_PRODUCTION
  setCookie(c, "csrftoken", secret, {
    maxAge: 31449600, // CSRF_COOKIE_AGE（1 年）
    path: "/",
    sameSite: secure ? "None" : "Lax",
    secure,
    httpOnly: false, // JS が読めるように（CSRF_COOKIE_HTTPONLY=False）
  });
  // Django get_token は Vary: Cookie を付与（共有キャッシュでの取り違え防止）
  c.header("Vary", "Cookie", { append: true });
  c.header("Cache-Control", "no-store");
  return c.json({ csrftoken: token });
};

authRoutes.get("/csrf", csrf);
authRoutes.get("/csrf/", csrf);

// SessionView（PublicAPIView）: POST=login / DELETE=logout。
// login: LoginSerializer 検証 → 認証 → SimpleJWT 発行 → HttpOnly cookie 設定、body は {}。
const login = async (c: Context<AppEnv>) => {
  // DRF は JSON/Form/MultiPart のみ受理（text/plain は 415）。ここでは frontend が使う
  // application/json のみに限定し、text/plain 経由の login-CSRF を塞ぐ（Django より厳格）。
  if (!isJsonRequest(c)) {
    return c.json(
      { detail: `Unsupported media type "${c.req.header("content-type") ?? ""}" in request.` },
      415,
    );
  }

  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  // LoginIPThrottle + LoginUsernameThrottle（serializer より前、DRF と同じ）
  const ip = clientIp(c);
  const usernameIdent =
    typeof obj.username === "string" && obj.username
      ? normalizeThrottleIdent(String(obj.username), true)
      : ip;
  const loginDenied = await enforceThrottles(c.env, [
    { scope: "login_ip", ident: ip },
    { scope: "login_username", ident: usernameIdent },
  ]);
  if (loginDenied) return throttledResponse(c, loginDenied);

  const errors: Record<string, string[]> = {};
  const u = charField(obj, "username", { required: true });
  if (u.kind === "error") errors.username = [u.message];
  const p = charField(obj, "password", { required: true });
  if (p.kind === "error") errors.password = [p.message];
  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const userId = await authenticateUser(
    c.env,
    (u as { value: string }).value,
    (p as { value: string }).value,
  );
  if (userId === null)
    return apiError(c, 400, "Authentication failed", "AUTHENTICATION_FAILED");

  const { access, refresh } = await issueTokenPair(c.env, userId);
  setAuthCookies(c, access, refresh);
  return c.json({});
};

// access_token(10分)/refresh_token(14日) を HttpOnly cookie に設定（login/refresh 共通）。
function setAuthCookies(c: Context<AppEnv>, access: string, refresh: string): void {
  const secure = c.env.ENVIRONMENT === "production"; // SECURE_COOKIES
  const sameSite = secure ? "None" : "Lax";
  setCookie(c, "access_token", access, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 60 * 10,
    path: "/",
  });
  setCookie(c, "refresh_token", refresh, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 60 * 60 * 24 * 14,
    path: "/",
  });
}

// logout: refresh 無効化は no-op（現行同様）。cookie を削除して 204。
const logout = (c: Context<AppEnv>) => {
  const secure = c.env.ENVIRONMENT === "production";
  const sameSite = secure ? "None" : "Lax";
  deleteCookie(c, "access_token", { path: "/", sameSite, secure });
  deleteCookie(c, "refresh_token", { path: "/", sameSite, secure });
  return c.body(null, 204);
};

// RefreshView（PublicAPIView）: refresh_token cookie を検証しトークンを rotation（body {}）。
// cookie 欠落・無効は 401 AUTHENTICATION_FAILED "Invalid refresh token"。
const refresh = async (c: Context<AppEnv>) => {
  const token = getCookie(c, "refresh_token");
  if (!token) return apiError(c, 401, "Invalid refresh token", "AUTHENTICATION_FAILED");

  const userId = await verifyRefreshToken(c.env, token);
  if (userId === null)
    return apiError(c, 401, "Invalid refresh token", "AUTHENTICATION_FAILED");

  // ROTATE_REFRESH_TOKENS=True / BLACKLIST_AFTER_ROTATION=False → 新ペア発行（旧は失効させない）
  const pair = await issueTokenPair(c.env, userId);
  setAuthCookies(c, pair.access, pair.refresh);
  return c.json({});
};

authRoutes.post("/sessions", login);
authRoutes.post("/sessions/", login);
authRoutes.delete("/sessions", logout);
authRoutes.delete("/sessions/", logout);
authRoutes.post("/tokens", refresh);
authRoutes.post("/tokens/", refresh);

// AccountDeleteView.delete（AuthenticatedAPIView=CookieJWT）: 匿名化+非アクティブ化 +
// データ削除タスク投入 + cookie 削除 → 204。reason は任意。
const deleteAccount = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  // AccountDeleteSerializer: reason CharField(required=False, allow_blank=True)
  let reason = "";
  const r = charField(obj, "reason", { required: false, allowBlank: true });
  if (r.kind === "error") return drfValidationError(c, { reason: [r.message] });
  if (r.kind === "value") reason = r.value;

  await requestAccountDeletion(c.env, userId, reason);
  await enqueueAccountDeletion(c.env, userId);

  const secure = c.env.ENVIRONMENT === "production";
  const sameSite = secure ? "None" : "Lax";
  deleteCookie(c, "access_token", { path: "/", sameSite, secure });
  deleteCookie(c, "refresh_token", { path: "/", sameSite, secure });
  return c.body(null, 204);
};

authRoutes.delete("/account", requireAuth(jwtMethod), csrfProtect, deleteAccount);
authRoutes.delete("/account/", requireAuth(jwtMethod), csrfProtect, deleteAccount);

// EmailVerificationView.patch（PublicAPIView）: uid/token を検証して activate。
const verifyEmail = async (c: Context<AppEnv>) => {
  const INVALID = "Invalid or expired verification link.";
  const pk = decodeUidToPk(c.req.param("uidb64") ?? "");
  if (pk === null) return apiError(c, 400, INVALID);
  const user = await getUserForToken(c.env, pk);
  if (!user) return apiError(c, 400, INVALID);
  const ok = await checkDjangoToken(
    c.env,
    { pk: user.id, password: user.password, email: user.email, lastLogin: user.lastLogin },
    c.req.param("token") ?? "",
  );
  if (!ok) return apiError(c, 400, INVALID);
  await activateUser(c.env, pk);
  return c.json({ message: "Email verification completed. Please sign in." });
};

authRoutes.patch("/email-verifications/:uidb64/:token", verifyEmail);
authRoutes.patch("/email-verifications/:uidb64/:token/", verifyEmail);

// PasswordResetRequestView.post（PublicAPIView）: email → アクティブユーザーがいれば再設定メール。
// 未登録でも同一の 200（列挙防止）。throttle: PasswordResetIP/Email（3/hour）。
const requestPasswordReset = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  const ip = clientIp(c);
  const emailIdent =
    typeof obj.email === "string" && obj.email
      ? normalizeThrottleIdent(String(obj.email), true)
      : ip;
  const resetDenied = await enforceThrottles(c.env, [
    { scope: "password_reset_ip", ident: ip },
    { scope: "password_reset_email", ident: emailIdent },
  ]);
  if (resetDenied) return throttledResponse(c, resetDenied);

  // PasswordResetRequestSerializer: email = EmailField()
  const em = charField(obj, "email", { required: true });
  if (em.kind === "error") return drfValidationError(c, { email: [em.message] });
  const email = (em as { value: string }).value;
  if (!isValidEmail(email))
    return drfValidationError(c, { email: ["Enter a valid email address."] });

  // PasswordResetRequestPolicy.normalized_email は strip のみ（signup と違い lower しない）。
  // 照合は email__iexact なので大文字小文字は無視される。
  const user = await findActiveUserByEmail(c.env, email.trim());
  if (user) {
    const link = await buildPasswordResetLink(c.env, {
      pk: user.id,
      passwordHash: user.password,
      email: user.email,
      lastLogin: user.lastLogin,
    });
    // 送信失敗は use case も view も握らないので 500（onError の統一封筒）。
    await sendPasswordResetEmail(c.env, user.email, link);
  }

  return c.json({ message: "Password reset email sent. Please check your email." });
};

authRoutes.post("/password-resets", requestPasswordReset);
authRoutes.post("/password-resets/", requestPasswordReset);

// PasswordResetConfirmView.patch（PublicAPIView）: serializer(new_password) → uid/token → set_password。
const confirmPasswordReset = async (c: Context<AppEnv>) => {
  // 先に serializer（new_password: min_length=8 + validate_password）
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
  const np = charField(obj, "new_password", { required: true, minLength: 8 });
  if (np.kind === "error") return drfValidationError(c, { new_password: [np.message] });
  const newPassword = (np as { value: string }).value;
  const pwErrors = validateDjangoPassword(newPassword);
  if (pwErrors.length) return drfValidationError(c, { new_password: pwErrors });

  const INVALID = "Invalid or expired reset link.";
  const pk = decodeUidToPk(c.req.param("uidb64") ?? "");
  if (pk === null) return apiError(c, 400, INVALID);
  const user = await getUserForToken(c.env, pk);
  if (!user) return apiError(c, 400, INVALID);
  const ok = await checkDjangoToken(
    c.env,
    { pk: user.id, password: user.password, email: user.email, lastLogin: user.lastLogin },
    c.req.param("token") ?? "",
  );
  if (!ok) return apiError(c, 400, INVALID);

  await setUserPassword(c.env, pk, newPassword);
  return c.json({
    message: "Password reset successfully. Please sign in with your new password.",
  });
};

authRoutes.patch("/password-resets/:uidb64/:token", confirmPasswordReset);
authRoutes.patch("/password-resets/:uidb64/:token/", confirmPasswordReset);

// EmailChangeRequestView.patch（AuthenticatedAPIView）: pending_email を保存し新アドレスへ確認メール。
// 既に誰かが使っているアドレスはサイレント成功（列挙防止・pending_email も設定しない）。
// throttle: EmailChangeUser/Email（3/hour）。
const requestEmailChange = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  const ip = clientIp(c);
  const emailIdent =
    typeof obj.email === "string" && obj.email
      ? normalizeThrottleIdent(String(obj.email), true)
      : ip;
  const changeDenied = await enforceThrottles(c.env, [
    { scope: "email_change_user", ident: String(userId) },
    { scope: "email_change_email", ident: emailIdent },
  ]);
  if (changeDenied) return throttledResponse(c, changeDenied);

  // EmailChangeRequestSerializer: email = EmailField()
  const em = charField(obj, "email", { required: true });
  if (em.kind === "error") return drfValidationError(c, { email: [em.message] });
  const emailInput = (em as { value: string }).value;
  if (!isValidEmail(emailInput))
    return drfValidationError(c, { email: ["Enter a valid email address."] });

  const OK = { message: "Email change confirmation sent. Please check your new email address." };
  const normalized = normalizeEmail(emailInput); // strip + lower
  if (await emailExists(c.env, normalized)) return c.json(OK); // 自分の現アドレスもここに該当

  // Django は送信が失敗しても pending_email を戻さない（同挙動を維持）。
  await setPendingEmail(c.env, userId, normalized);
  const user = await getUserForEmailChange(c.env, userId);
  try {
    if (!user?.pendingEmail) throw new Error("pending_email is missing after update");
    const link = await buildEmailChangeLink(c.env, {
      pk: user.id,
      passwordHash: user.password,
      email: user.email,
      pendingEmail: user.pendingEmail,
      lastLogin: user.lastLogin,
    });
    await sendEmailChangeConfirmation(c.env, user.pendingEmail, link);
  } catch {
    // EmailChangeEmailSendFailed → 500（create_error_response が INTERNAL_ERROR に置換）
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." } },
      500,
    );
  }
  return c.json(OK);
};

authRoutes.patch("/me/email", requireAuth(jwtMethod), csrfProtect, requestEmailChange);
authRoutes.patch("/me/email/", requireAuth(jwtMethod), csrfProtect, requestEmailChange);

// EmailChangeConfirmView.patch（PublicAPIView）: uid/token を検証して pending_email を確定。
const confirmEmailChange = async (c: Context<AppEnv>) => {
  const INVALID = "Invalid or expired email change link.";
  const pk = decodeUidToPk(c.req.param("uidb64") ?? "");
  if (pk === null) return apiError(c, 400, INVALID);
  const user = await getUserForEmailChange(c.env, pk);
  if (!user?.pendingEmail) return apiError(c, 400, INVALID);

  const ok = await checkEmailChangeToken(
    c.env,
    {
      pk: user.id,
      password: user.password,
      email: user.email,
      lastLogin: user.lastLogin,
      pendingEmail: user.pendingEmail,
    },
    c.req.param("token") ?? "",
  );
  if (!ok) return apiError(c, 400, INVALID);

  if (!(await confirmPendingEmail(c.env, pk, user.pendingEmail)))
    return apiError(c, 400, INVALID); // 他ユーザーが同アドレスを取得済み
  return c.json({ message: "Email address updated." });
};

authRoutes.patch("/email-change/:uidb64/:token", confirmEmailChange);
authRoutes.patch("/email-change/:uidb64/:token/", confirmEmailChange);

// ApiKey 管理（AuthenticatedAPIView = CookieJWTAuthentication のみ = jwtMethod）。
// API キー自身では管理不可（jwt/cookie 認証必須）。書き込みは CSRF（cookie 時）。
const jwtOnly = requireAuth(jwtMethod);
const jwtWriteGuards = [requireAuth(jwtMethod), csrfProtect] as const;

// GET /api/auth/api-keys ── アクティブキー一覧（生キーは返さない）
const listApiKeysHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  return c.json(await listApiKeys(c.env, userId));
};

// POST /api/auth/api-keys ── 作成（生キーは 1 回だけ返す）
const createApiKeyHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  const errors: Record<string, string[]> = {};
  const nameRes = charField(obj, "name", { required: true, maxLength: 100 });
  if (nameRes.kind === "error") errors.name = [nameRes.message];

  // access_level: ChoiceField(choices=[all, read_only], default=all)
  let accessLevel = "all";
  if ("access_level" in obj) {
    const v = obj.access_level;
    if (v === null) errors.access_level = ["This field may not be null."];
    else if (v === "all" || v === "read_only") accessLevel = v;
    else errors.access_level = [`"${String(v)}" is not a valid choice.`];
  }

  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const name = (nameRes as { value: string }).value; // charField で trim 済み
  // DuplicateApiKeyName（ValueError）→ view で {"name":[str(e)]} の 400
  if (await existsActiveApiKeyName(c.env, userId, name))
    return drfValidationError(c, {
      name: [`An active API key with this name already exists: ${name}`],
    });

  const { apiKey, rawKey } = await createApiKey(c.env, userId, name, accessLevel);
  return c.json({ ...apiKey, api_key: rawKey }, 201);
};

// DELETE /api/auth/api-keys/:pk ── 失効
const revokeApiKeyHandler = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const keyId = Number(c.req.param("id"));
  const ok = await revokeApiKey(c.env, keyId, userId);
  if (!ok) return apiError(c, 404, "API key not found");
  return c.body(null, 204);
};

// UserSignupView（PublicAPIView）: 新規登録 + 検証メール送信。
// enumeration 対策: email 既登録でも成功と同一の 201 メッセージを返す（user は作らない）。
// Content-Type の essence（";" より前）が application/json か。charset 付きは許容、
// "text/plain;x=application/json" のような偽装は弾く。
function isJsonRequest(c: Context<AppEnv>): boolean {
  const ct = c.req.header("content-type") ?? "";
  return ct.split(";")[0].trim().toLowerCase() === "application/json";
}

const SIGNUP_OK_MESSAGE = "Verification email sent. Please check your email.";
const signup = async (c: Context<AppEnv>) => {
  // login と同様 application/json に限定（text/plain 経由の CSRF/濫用を抑止）
  if (!isJsonRequest(c))
    return c.json(
      { detail: `Unsupported media type "${c.req.header("content-type") ?? ""}" in request.` },
      415,
    );

  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  // SignupIPThrottle + SignupEmailThrottle（3/hour）
  const ip = clientIp(c);
  const emailIdent =
    typeof obj.email === "string" && obj.email
      ? normalizeThrottleIdent(String(obj.email), true)
      : ip;
  const signupDenied = await enforceThrottles(c.env, [
    { scope: "signup_ip", ident: ip },
    { scope: "signup_email", ident: emailIdent },
  ]);
  if (signupDenied) return throttledResponse(c, signupDenied);

  const errors: Record<string, string[]> = {};
  const uname = charField(obj, "username", { required: true, maxLength: 150 });
  if (uname.kind === "error") errors.username = [uname.message];

  let emailValue = "";
  const em = charField(obj, "email", { required: true });
  if (em.kind === "error") errors.email = [em.message];
  else if (em.kind === "value") {
    if (!isValidEmail(em.value)) errors.email = ["Enter a valid email address."];
    else emailValue = em.value;
  }

  let passwordValue = "";
  const pw = charField(obj, "password", { required: true });
  if (pw.kind === "error") errors.password = [pw.message];
  else if (pw.kind === "value") {
    const pwErrors = validateDjangoPassword(pw.value);
    if (pwErrors.length) errors.password = pwErrors;
    else passwordValue = pw.value;
  }

  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const username = (uname as { value: string }).value;
  const normalized = normalizeEmail(emailValue); // strip + lower

  // 既登録でも 201 同一メッセージ（列挙防止）。user は作成しない。
  if (await emailExists(c.env, normalized))
    return c.json({ message: SIGNUP_OK_MESSAGE }, 201);

  const { id, passwordHash } = await createInactiveUser(
    c.env,
    username,
    normalized,
    passwordValue,
  );

  try {
    const link = await buildVerificationLink(c.env, {
      pk: id,
      passwordHash,
      email: normalized,
    });
    await sendVerificationEmail(c.env, normalized, link);
  } catch {
    // VerificationEmailSendFailed → 500（create_error_response が 500 で INTERNAL_ERROR に置換）
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "An internal server error occurred." } },
      500,
    );
  }

  return c.json({ message: SIGNUP_OK_MESSAGE }, 201);
};

authRoutes.post("/users", signup);
authRoutes.post("/users/", signup);

authRoutes.get("/api-keys", jwtOnly, listApiKeysHandler);
authRoutes.get("/api-keys/", jwtOnly, listApiKeysHandler);
authRoutes.post("/api-keys", ...jwtWriteGuards, createApiKeyHandler);
authRoutes.post("/api-keys/", ...jwtWriteGuards, createApiKeyHandler);
authRoutes.delete("/api-keys/:id{[0-9]+}", ...jwtWriteGuards, revokeApiKeyHandler);
authRoutes.delete("/api-keys/:id{[0-9]+}/", ...jwtWriteGuards, revokeApiKeyHandler);

// SearchApiKeyView（AuthenticatedAPIView）: ユーザーごとの SearchAPI キーを管理。
// 値は Django と同じ Fernet（SECRET_KEY 由来鍵）で暗号化して bytea に保存する。
const searchApiKeyStatus = async (c: Context<AppEnv>) => {
  const has = await getSearchApiKeyStatus(c.env, c.get("userId")!);
  // GET は use case の ResourceNotFound を view が握らないので、不在は 500 のまま（現行同様）
  if (has === null) throw new Error("User not found.");
  return c.json({ has_api_key: has });
};

const saveSearchApiKey = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const obj = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};

  // SearchApiKeySerializer: api_key = CharField(write_only=True, trim_whitespace=True)
  const field = charField(obj, "api_key", { required: true });
  if (field.kind === "error") return drfValidationError(c, { api_key: [field.message] });
  // SetSearchApiKeyUseCase: strip 後に空なら ValueError → {"api_key": [...]} の 400
  const apiKey = (field as { value: string }).value.trim();
  if (!apiKey) return drfValidationError(c, { api_key: ["api_key is required"] });

  const token = await fernetEncrypt(c.env, apiKey);
  if (!(await setSearchApiKey(c.env, c.get("userId")!, token)))
    return apiError(c, 404, "User not found", "NOT_FOUND");
  return c.json({ message: "SearchAPI API key saved." });
};

const removeSearchApiKey = async (c: Context<AppEnv>) => {
  if (!(await deleteSearchApiKey(c.env, c.get("userId")!)))
    return apiError(c, 404, "User not found", "NOT_FOUND");
  return c.json({ message: "SearchAPI API key deleted." });
};

authRoutes.get("/searchapi-key", jwtOnly, searchApiKeyStatus);
authRoutes.get("/searchapi-key/", jwtOnly, searchApiKeyStatus);
authRoutes.put("/searchapi-key", ...jwtWriteGuards, saveSearchApiKey);
authRoutes.put("/searchapi-key/", ...jwtWriteGuards, saveSearchApiKey);
authRoutes.delete("/searchapi-key", ...jwtWriteGuards, removeSearchApiKey);
authRoutes.delete("/searchapi-key/", ...jwtWriteGuards, removeSearchApiKey);

// MeView.authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication] と同順。
const meAuth = requireAuth(apiKeyMethod, jwtMethod);

const me = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!; // 認証通過後は必ず存在
  const user = await getCurrentUser(c.env, userId);
  if (!user) return c.json({ detail: "Not found." }, 404);
  return c.json(user); // 統一封筒を使わず Django の生レスポンス形を返す
};

// Django は末尾スラッシュ（APPEND_SLASH）。両方受ける。
authRoutes.get("/me", meAuth, me);
authRoutes.get("/me/", meAuth, me);
