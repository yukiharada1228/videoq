import type { Context } from "hono";
import * as userRepository from "../../repositories/user-repository";
import { encryptUserSecret } from "../../lib/secret-encryption";
import type { AppEnv } from "../../types/bindings";
import { requireUserId, rpcError, type HandlersFor } from "./shared";

export function accountHandlers(
  c: Context<AppEnv>,
  authenticatedUserId: string | null,
): HandlersFor<"account"> {
  const userId = () => requireUserId(authenticatedUserId);
  return {
    "account.me": async () => {
      const user = await userRepository.getCurrentUser(c.env, userId());
      if (!user) return rpcError("NOT_FOUND", "User not found");
      return user;
    },
    "account.searchApiKeyStatus": async () => {
      const has = await userRepository.getSearchApiKeyStatus(c.env, userId());
      if (has === null) return rpcError("NOT_FOUND", "User not found");
      return { has_api_key: has };
    },
    "account.saveSearchApiKey": async ({ apiKey }) => {
      const encrypted = await encryptUserSecret(c.env, apiKey);
      const ok = await userRepository.setSearchApiKey(c.env, userId(), encrypted);
      if (!ok) return rpcError("NOT_FOUND", "User not found");
      return { success: true };
    },
    "account.deleteSearchApiKey": async () => {
      const ok = await userRepository.setSearchApiKey(c.env, userId(), null);
      if (!ok) return rpcError("NOT_FOUND", "User not found");
      return { success: true };
    },
  };
}
