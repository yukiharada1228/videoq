import { DEFAULT_EMBEDDING_MODEL, LlmConfigurationError, LlmProviderError, openAiBaseUrl, providerModel } from "./openai";
import { EMBEDDING_DIMENSIONS } from "./embedding-dimensions";

export { EMBEDDING_DIMENSIONS };

export type EmbeddingConfig = { provider: "openai"; model: string };
export type EmbeddingSettings = { EMBEDDING_MODEL?: string; EMBEDDING_BASE_URL?: string; OPENAI_BASE_URL?: string; OPENROUTER_API_KEY?: string; OPENROUTER_FEDERATION_POLICY_ID?: string };
export type EmbeddingReason =
  | "EMBEDDING_CONFIG_INVALID"
  | "EMBEDDING_SCHEMA_MISMATCH"
  | "EMBEDDING_OUTPUT_INVALID";

export function embeddingDiagnostic(
  config: EmbeddingConfig | undefined,
  details: { reason?: EmbeddingReason; db_dimensions?: number | null; actual_dimensions?: number | null } = {},
) {
  return { event: "embedding.validation", ...config, expected_dimensions: EMBEDDING_DIMENSIONS, ...details };
}

export class EmbeddingConfigurationError extends LlmConfigurationError {
  constructor(
    readonly reason: "EMBEDDING_CONFIG_INVALID" | "EMBEDDING_SCHEMA_MISMATCH",
    message: string,
    config?: EmbeddingConfig,
    dbDimensions?: number | null,
  ) {
    super(message);
    console.error(JSON.stringify(embeddingDiagnostic(config, { reason, db_dimensions: dbDimensions })));
  }
}

export class EmbeddingValidationError extends LlmProviderError {
  constructor(
    readonly reason: "EMBEDDING_OUTPUT_INVALID",
    config?: EmbeddingConfig,
    actualDimensions?: number | null,
  ) {
    super("Embedding data is incompatible. Ask an administrator to check the model and rebuild the affected embeddings.");
    console.error(JSON.stringify(embeddingDiagnostic(config, { reason, actual_dimensions: actualDimensions })));
  }
}

export function resolveEmbeddingConfig(env: EmbeddingSettings): EmbeddingConfig {
  const model = env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const baseURL = openAiBaseUrl({ ...env, OPENAI_BASE_URL: env.EMBEDDING_BASE_URL || env.OPENAI_BASE_URL });
  return { provider: "openai", model: providerModel(model, baseURL) };
}

export function validateEmbedding(
  value: unknown,
  reason: "EMBEDDING_OUTPUT_INVALID" = "EMBEDDING_OUTPUT_INVALID",
  config?: EmbeddingConfig,
): number[] {
  if (
    !Array.isArray(value) || value.length !== EMBEDDING_DIMENSIONS ||
    !value.every((v: unknown) => typeof v === "number" && Number.isFinite(v) && Number.isFinite(Math.fround(v))) ||
    !value.some((v: number) => Math.fround(v) !== 0)
  ) {
    throw new EmbeddingValidationError(reason, config, Array.isArray(value) ? value.length : null);
  }
  return value;
}
