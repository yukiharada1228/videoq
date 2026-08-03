import { z } from "../../shared/openapi";

const requiredString = (max?: number) => {
  let s = z.string().trim().min(1);
  if (max !== undefined) s = s.max(max);
  return s;
};

export const loginBodySchema = z
  .object({
    username: requiredString(),
    password: requiredString(),
  })
  .openapi("LoginBody");

export const emailBodySchema = z
  .object({
    email: requiredString(),
  })
  .openapi("EmailBody");

export const passwordResetConfirmSchema = z
  .object({
    new_password: z.string().min(12).max(128),
  })
  .openapi("PasswordResetConfirmBody");

export const apiKeyCreateSchema = z
  .object({
    name: requiredString(100),
    access_level: z.enum(["all", "read_only"]).optional().default("all"),
  })
  .openapi("ApiKeyCreateBody");

export const signupBodySchema = z
  .object({
    username: requiredString(150),
    email: requiredString(),
    password: z.string().min(12).max(128),
  })
  .openapi("SignupBody");

export const searchApiKeyBodySchema = z
  .object({
    api_key: requiredString(),
  })
  .openapi("SearchApiKeyBody");

export const actionTokenParamSchema = z.object({
  token: z.string().min(1),
});

export const apiKeyIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const messageResponseSchema = z
  .object({ message: z.string() })
  .openapi("AuthMessageResponse");

export const accessTokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
  })
  .openapi("AccessTokenResponse");

export const searchApiKeyStatusSchema = z
  .object({ has_api_key: z.boolean() })
  .openapi("SearchApiKeyStatus");
