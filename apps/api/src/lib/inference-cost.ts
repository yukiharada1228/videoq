/** Published standard API rates, USD per million tokens, checked 2026-10-23.
 * Groq: https://console.groq.com/docs/model/openai/gpt-oss-120b
 * OpenAI: https://developers.openai.com/api/docs/models/gpt-4o-mini
 * Missing usage/model pricing is unknown, never zero. Output includes reasoning.
 */
export function tokenCost(provider: string, model: string, usage: unknown): number | null {
  if (!(provider === "groq" && model === "openai/gpt-oss-120b"
    || provider === "openai" && /^gpt-4o-mini(?:-2024-07-18)?$/.test(model))) return null;
  if (!usage || typeof usage !== "object") return null;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } };
  if (typeof u.prompt_tokens !== "number" || typeof u.completion_tokens !== "number"
    || !Number.isFinite(u.prompt_tokens) || !Number.isFinite(u.completion_tokens)
    || u.prompt_tokens < 0 || u.completion_tokens < 0) return null;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  if (typeof cached !== "number" || !Number.isFinite(cached) || cached < 0 || cached > u.prompt_tokens) return null;
  return ((u.prompt_tokens - cached) * .15 + cached * .075 + u.completion_tokens * .60) / 1_000_000;
}
