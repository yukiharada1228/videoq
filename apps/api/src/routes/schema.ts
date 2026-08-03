import { Hono } from "hono";
import openApiDocument from "../openapi/openapi.json";
import type { AppEnv } from "../types/bindings";

/**
 * Django drf-spectacular 置換。
 * - GET /api/schema/ … OpenAPI JSON（フロント Developer Docs が fetch）
 * - GET /api/docs/  … Swagger UI（CDN）
 * - GET /api/redoc/ … ReDoc（CDN）
 */
export const schemaRoutes = new Hono<AppEnv>();

schemaRoutes.get("/api/schema", (c) => c.json(openApiDocument));
schemaRoutes.get("/api/schema/", (c) => c.json(openApiDocument));

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>VideoQ API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/schema/",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis],
    });
  </script>
</body>
</html>`;

const redocHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>VideoQ API — ReDoc</title>
  <style>body{margin:0;padding:0}</style>
</head>
<body>
  <redoc spec-url="/api/schema/"></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

schemaRoutes.get("/api/docs", (c) => c.html(swaggerHtml));
schemaRoutes.get("/api/docs/", (c) => c.html(swaggerHtml));
schemaRoutes.get("/api/redoc", (c) => c.html(redocHtml));
schemaRoutes.get("/api/redoc/", (c) => c.html(redocHtml));
