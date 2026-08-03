import type { Bindings } from "../../types/bindings";
import {
  createManualApplication as repoCreateManualApplication,
  deleteOAuthApplicationCascade as repoDeleteOAuthApplicationCascade,
  getApplicationForUser as repoGetApplicationForUser,
  listApplicationsForUser as repoListApplicationsForUser,
  listAuthorizedTokens as repoListAuthorizedTokens,
  revokeAuthorizedToken as repoRevokeAuthorizedToken,
  updateManualApplication as repoUpdateManualApplication,
  type ManualApplicationInput,
  type OAuthApplication,
} from "../../repositories/oauth-repository";

export type AppFormData = ManualApplicationInput;

export type { OAuthApplication };

export function parseAppFormData(form: Record<string, string>): AppFormData {
  const clientType = form.client_type === "public" ? "public" : "confidential";
  return {
    name: (form.name || "").trim(),
    clientType,
    authorizationGrantType: (form.authorization_grant_type || "").trim(),
    redirectUris: (form.redirect_uris || "").trim(),
  };
}

export function listApplicationsForUser(env: Bindings, userId: number) {
  return repoListApplicationsForUser(env, userId);
}

export function createManualApplication(
  env: Bindings,
  userId: number,
  input: AppFormData,
) {
  return repoCreateManualApplication(env, userId, input);
}

export function updateManualApplication(
  env: Bindings,
  userId: number,
  appId: number,
  input: AppFormData,
) {
  return repoUpdateManualApplication(env, userId, appId, input);
}

export function getApplicationForUser(env: Bindings, userId: number, appId: number) {
  return repoGetApplicationForUser(env, userId, appId);
}

export function deleteOAuthApplicationCascade(env: Bindings, appId: number) {
  return repoDeleteOAuthApplicationCascade(env, appId);
}

export function listAuthorizedTokens(env: Bindings, userId: number) {
  return repoListAuthorizedTokens(env, userId);
}

export function revokeAuthorizedToken(env: Bindings, userId: number, tokenId: number) {
  return repoRevokeAuthorizedToken(env, userId, tokenId);
}
