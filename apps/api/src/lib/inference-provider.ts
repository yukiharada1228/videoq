import type { Bindings } from "../types/bindings";
import { LlmConfigurationError } from "./openai";

export type LlmProvider = "groq" | "openai" | "local";
export const GROQ_MODEL = "openai/gpt-oss-120b";
export const OPENAI_FALLBACK_MODEL = "gpt-4o-mini";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MODELS = new Set([OPENAI_FALLBACK_MODEL, "gpt-4o-mini-2024-07-18", "gpt-6-luna"]);
export type LlmRoute = { provider: LlmProvider; model: string; apiKey: string; baseURL: string };

export function resolveLlmRoute(env: Bindings): LlmRoute {
  const onprem = env.DEPLOYMENT_EDITION === "onprem" || env.RUNTIME === "node" && env.DEPLOYMENT_EDITION !== "cloud";
  const provider = env.LLM_PROVIDER || (onprem ? "local" : "groq");
  if (!["groq", "openai", "local"].includes(provider)) throw new LlmConfigurationError("LLM_PROVIDER must be groq, openai or local.");
  if (onprem && provider !== "local") throw new LlmConfigurationError("On-premises inference requires LLM_PROVIDER=local.");
  const model = env.LLM_MODEL || (provider === "groq" ? GROQ_MODEL : provider === "openai" ? OPENAI_FALLBACK_MODEL : "gpt-6-luna");
  if (provider === "groq" && model !== GROQ_MODEL || provider === "openai" && !OPENAI_MODELS.has(model)
    || provider === "local" && !/^[A-Za-z0-9][A-Za-z0-9_./:+-]{0,127}$/.test(model)) {
    throw new LlmConfigurationError("Unsupported LLM_MODEL for the selected LLM_PROVIDER.");
  }
  const keyName = provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY";
  const apiKey = env[keyName]?.trim();
  if (!apiKey && provider !== "local") throw new LlmConfigurationError(`${keyName} is required for the selected LLM_PROVIDER.`);
  if (provider === "groq" && !env.OPENAI_API_KEY?.trim()) throw new LlmConfigurationError("OPENAI_API_KEY is required for the configured OpenAI fallback.");
  if (provider === "groq" && env.LLM_REASONING_EFFORT && !["low", "medium", "high"].includes(env.LLM_REASONING_EFFORT)) {
    throw new LlmConfigurationError("Groq GPT-OSS reasoning effort must be low, medium or high.");
  }
  if (provider === "local" && !env.OPENAI_BASE_URL?.trim()) throw new LlmConfigurationError("OPENAI_BASE_URL is required for local inference.");
  if (provider === "local") {
    let url: URL;
    try { url = new URL(env.OPENAI_BASE_URL!); } catch { throw new LlmConfigurationError("Invalid local inference URL."); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || ["api.openai.com", "api.groq.com"].includes(url.hostname.replace(/\.$/, ""))) {
      throw new LlmConfigurationError("Local inference requires a private compatible endpoint.");
    }
  }
  return { provider: provider as LlmProvider, model, apiKey: apiKey || "local-inference",
    baseURL: provider === "groq" ? GROQ_BASE_URL : provider === "openai" ? OPENAI_BASE_URL : env.OPENAI_BASE_URL!.replace(/\/+$/, "") };
}

export function providerStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { status?: unknown; response?: { status?: unknown } };
  const status = e.status ?? e.response?.status;
  return typeof status === "number" ? status : undefined;
}

/** Only transport/availability failures; validation, auth, TLS and cancellation fail closed. */
export function isTransientInferenceError(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return false;
  if (!(error instanceof Error)) return false;
  const nested = error as Error & { code?: string; cause?: { code?: string; message?: string } };
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth++) {
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (/cert|tls|ssl/i.test(`${e.message || ""} ${e.code || ""}`)) return false;
    current = e.cause;
  }
  const status = providerStatus(error);
  if (status !== undefined) return [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529].includes(status);
  return ["APIConnectionError", "APIConnectionTimeoutError"].some(name => error.name === name || error.constructor.name === name)
    || ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"].includes(nested.code || nested.cause?.code || "");
}

export async function inferenceBackoff(attempt: number, signal?: AbortSignal | null): Promise<void> {
  signal?.throwIfAborted();
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const ms = Math.min(1000, 150 * 2 ** attempt) * (.5 + random / 2);
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
