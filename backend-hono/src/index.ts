import { createApp } from "./app";

// Cloudflare Workers のエントリ（Hono アプリは fetch ハンドラそのもの）。
const app = createApp();

export default app;
