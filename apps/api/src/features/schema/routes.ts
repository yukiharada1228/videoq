import { createFeatureRouter } from "../../shared/openapi";

/**
 * API schema とドキュメントを配信する。
 * - `/api/schema` / `/api/docs` は `registerOpenApiDoc`（ライブ OpenAPI + Scalar）が担当
 * - ここは ReDoc のみ（CDN + `/api/openapi.json`）
 */
export const schemaRoutes = createFeatureRouter();

const redocHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>VideoQ API — ReDoc</title>
  <style>body{margin:0;padding:0}</style>
</head>
<body>
  <redoc spec-url="/api/openapi.json"></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;

schemaRoutes.get("/redoc", (c) => c.html(redocHtml));
