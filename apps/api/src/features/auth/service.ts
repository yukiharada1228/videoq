import {
  getCurrentUser,
  authenticateUser,
  emailExists,
  createInactiveUser,
  requestAccountDeletion,
  findActiveUserByEmail,
  activateUser,
  setUserPassword,
  setPendingEmail,
  confirmPendingEmail,
  getSearchApiKeyStatus,
  setSearchApiKey,
  deleteSearchApiKey,
} from "../../repositories/user-repository";
import { enqueueAccountDeletion } from "../../lib/jobs";
import { encryptUserSecret } from "../../lib/secret-encryption";
import { validatePassword } from "../../lib/password-validators";
import { isValidEmail, normalizeEmail } from "../../lib/email";
import {
  buildVerificationLink,
  sendVerificationEmail,
  buildPasswordResetLink,
  sendPasswordResetEmail,
  buildEmailChangeLink,
  sendEmailChangeConfirmation,
} from "../../lib/auth-email";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  existsActiveApiKeyName,
} from "../../repositories/api-key-repository";
import { issueAccessToken } from "../../lib/jwt";
import {
  consumeActionToken,
  createActionToken,
  createAuthSession,
  revokeAuthSession,
  rotateAuthSession,
} from "../../repositories/auth-repository";
import type { Bindings } from "../../types/bindings";

export const SIGNUP_OK_MESSAGE =
  "Verification email sent. Please check your email.";

export async function login(
  env: Bindings,
  username: string,
  password: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; code: "AUTHENTICATION_FAILED" }
> {
  const userId = await authenticateUser(env, username, password);
  if (userId === null) return { ok: false, code: "AUTHENTICATION_FAILED" };
  const session = await createAuthSession(env, userId);
  const accessToken = await issueAccessToken(env, userId, session.sessionId);
  return { ok: true, accessToken, refreshToken: session.refreshToken };
}

export async function refreshSession(
  env: Bindings,
  refreshToken: string | undefined,
): Promise<
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; code: "AUTHENTICATION_FAILED" }
> {
  if (!refreshToken) return { ok: false, code: "AUTHENTICATION_FAILED" };
  const session = await rotateAuthSession(env, refreshToken);
  if (!session) return { ok: false, code: "AUTHENTICATION_FAILED" };
  const accessToken = await issueAccessToken(
    env,
    session.userId,
    session.sessionId,
  );
  return { ok: true, accessToken, refreshToken: session.refreshToken };
}

export async function logout(
  env: Bindings,
  refreshToken: string | undefined,
): Promise<void> {
  await revokeAuthSession(env, refreshToken);
}

export async function deleteAccount(
  env: Bindings,
  userId: number,
  reason: string,
): Promise<void> {
  await requestAccountDeletion(env, userId, reason);
  await enqueueAccountDeletion(env, userId);
}

export async function verifyEmail(
  env: Bindings,
  token: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const INVALID = "Invalid or expired verification link.";
  const action = await consumeActionToken(env, token, "verify_email");
  if (!action) return { ok: false, message: INVALID };
  await activateUser(env, action.userId);
  return { ok: true };
}

export async function requestPasswordReset(
  env: Bindings,
  email: string,
): Promise<
  | { ok: true }
  | { ok: false; details: Record<string, string[]> }
> {
  if (!isValidEmail(email)) {
    return { ok: false, details: { email: ["Enter a valid email address."] } };
  }
  const user = await findActiveUserByEmail(env, email.trim());
  if (user) {
    const token = await createActionToken(
      env,
      user.id,
      "reset_password",
      {},
      24 * 60 * 60,
    );
    const link = buildPasswordResetLink(env, token);
    await sendPasswordResetEmail(env, user.email, link);
  }
  return { ok: true };
}

export async function confirmPasswordReset(
  env: Bindings,
  token: string,
  newPassword: string,
): Promise<
  | { ok: true }
  | { ok: false; details: Record<string, string[]> }
  | { ok: false; message: string }
> {
  const pwErrors = validatePassword(newPassword);
  if (pwErrors.length) {
    return { ok: false, details: { new_password: pwErrors } };
  }
  const INVALID = "Invalid or expired reset link.";
  const action = await consumeActionToken(env, token, "reset_password");
  if (!action) return { ok: false, message: INVALID };
  await setUserPassword(env, action.userId, newPassword);
  return { ok: true };
}

export async function requestEmailChange(
  env: Bindings,
  userId: number,
  emailInput: string,
): Promise<
  | { ok: true }
  | { ok: false; details: Record<string, string[]> }
  | { ok: false; internalError: true }
> {
  if (!isValidEmail(emailInput)) {
    return { ok: false, details: { email: ["Enter a valid email address."] } };
  }
  const normalized = normalizeEmail(emailInput);
  if (await emailExists(env, normalized)) return { ok: true };

  await setPendingEmail(env, userId, normalized);
  try {
    const token = await createActionToken(
      env,
      userId,
      "change_email",
      { email: normalized },
      24 * 60 * 60,
    );
    const link = buildEmailChangeLink(env, token);
    await sendEmailChangeConfirmation(env, normalized, link);
  } catch {
    return { ok: false, internalError: true };
  }
  return { ok: true };
}

export async function confirmEmailChange(
  env: Bindings,
  token: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const INVALID = "Invalid or expired email change link.";
  const action = await consumeActionToken(env, token, "change_email");
  const pendingEmail = action?.payload.email;
  if (!action || typeof pendingEmail !== "string") {
    return { ok: false, message: INVALID };
  }
  if (!(await confirmPendingEmail(env, action.userId, pendingEmail))) {
    return { ok: false, message: INVALID };
  }
  return { ok: true };
}

export async function signup(
  env: Bindings,
  data: { username: string; email: string; password: string },
): Promise<
  | { ok: true }
  | { ok: false; details: Record<string, string[]> }
  | { ok: false; internalError: true }
> {
  const errors: Record<string, string[]> = {};
  if (!isValidEmail(data.email)) {
    errors.email = ["Enter a valid email address."];
  }
  const pwErrors = validatePassword(data.password);
  if (pwErrors.length) errors.password = pwErrors;
  if (Object.keys(errors).length) return { ok: false, details: errors };

  const normalized = normalizeEmail(data.email);
  if (await emailExists(env, normalized)) return { ok: true };

  const { id } = await createInactiveUser(
    env,
    data.username,
    normalized,
    data.password,
  );

  try {
    const token = await createActionToken(
      env,
      id,
      "verify_email",
      {},
      24 * 60 * 60,
    );
    const link = buildVerificationLink(env, token);
    await sendVerificationEmail(env, normalized, link);
  } catch {
    return { ok: false, internalError: true };
  }
  return { ok: true };
}

export async function listUserApiKeys(env: Bindings, userId: number) {
  return listApiKeys(env, userId);
}

export async function createUserApiKey(
  env: Bindings,
  userId: number,
  name: string,
  accessLevel: "all" | "read_only",
): Promise<
  | { ok: true; apiKey: Awaited<ReturnType<typeof createApiKey>> }
  | { ok: false; details: Record<string, string[]> }
> {
  if (await existsActiveApiKeyName(env, userId, name)) {
    return {
      ok: false,
      details: {
        name: [`An active API key with this name already exists: ${name}`],
      },
    };
  }
  const created = await createApiKey(env, userId, name, accessLevel);
  return { ok: true, apiKey: created };
}

export async function revokeUserApiKey(
  env: Bindings,
  userId: number,
  keyId: number,
): Promise<boolean> {
  return revokeApiKey(env, keyId, userId);
}

export async function searchApiKeyStatus(env: Bindings, userId: number) {
  const has = await getSearchApiKeyStatus(env, userId);
  if (has === null) throw new Error("User not found.");
  return { has_api_key: has };
}

export async function saveUserSearchApiKey(
  env: Bindings,
  userId: number,
  rawKey: string,
): Promise<
  | { ok: true }
  | { ok: false; details: Record<string, string[]> }
  | { ok: false; notFound: true }
> {
  const apiKey = rawKey.trim();
  if (!apiKey) {
    return { ok: false, details: { api_key: ["api_key is required"] } };
  }
  const token = await encryptUserSecret(env, apiKey);
  if (!(await setSearchApiKey(env, userId, token))) {
    return { ok: false, notFound: true };
  }
  return { ok: true };
}

export async function removeUserSearchApiKey(
  env: Bindings,
  userId: number,
): Promise<boolean> {
  return deleteSearchApiKey(env, userId);
}

export async function getMe(env: Bindings, userId: number) {
  return getCurrentUser(env, userId);
}
