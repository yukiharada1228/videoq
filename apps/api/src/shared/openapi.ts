import {
  OpenAPIHono,
  createRoute,
  z,
  type RouteConfig,
} from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import type { Context } from "hono";
import type { AppEnv } from "../types/bindings";
import { errorBodySchema } from "./errors";
import { onError } from "../middleware/error-handler";

export { createRoute, z };

type JsonResponse = RouteConfig["responses"][string];

export function jsonResponse(
  schema: z.ZodType,
  description = "OK",
): JsonResponse {
  return {
    description,
    content: {
      "application/json": { schema },
    },
  };
}

export function errorResponse(description: string): JsonResponse {
  return jsonResponse(errorBodySchema, description);
}

/** Zod issues → `{ field: string[] }`（FE / 既存テストが期待する details 形）。 */
export function zodFieldDetails(
  error: z.ZodError,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function createFeatureRouter() {
  const router = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = zodFieldDetails(result.error);
        const firstField = Object.keys(details)[0];
        const message = details[firstField]?.[0] ?? "Invalid request";
        return c.json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message,
              details,
            },
          },
          400,
        );
      }
    },
  });
  // feature 単体 .request() / サブマウントでも ApiError を封筒化する
  router.onError(onError);
  return router;
}

export function registerOpenApiDoc(app: OpenAPIHono<AppEnv>) {
  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: "X-API-Key",
    description: "VideoQ API key.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Application or OAuth bearer access token.",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "OAuth2", {
    type: "oauth2",
    flows: {
      authorizationCode: {
        authorizationUrl: "/api/oauth/authorize",
        tokenUrl: "/api/oauth/token",
        scopes: {
          read: "Read access",
          write: "Write access",
          mcp: "MCP access",
        },
      },
    },
  });

  const docInfo = (c: Context<AppEnv>) => ({
    openapi: "3.1.0" as const,
    info: {
      title: "VideoQ API",
      version: "2.0.0",
      description: "Hono-native OpenAPI surface. Domains live under features/*.",
    },
    servers: [
      {
        url: new URL(c.req.url).origin,
        description: c.env.ENVIRONMENT,
      },
    ],
  });

  // Canonical schema plus a short application alias.
  app.doc("/api/openapi.json", docInfo);
  app.doc("/api/schema", docInfo);

  app.get(
    "/api/docs",
    Scalar({
      url: "/api/openapi.json",
      pageTitle: "VideoQ API",
    }),
  );
}
