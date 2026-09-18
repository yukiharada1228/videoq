import { DEFAULT_EMBEDDING_MODEL, LlmConfigurationError, LlmProviderError } from "./openai";
import { EMBEDDING_DIMENSIONS } from "./embedding-dimensions";

export { EMBEDDING_DIMENSIONS };

export type EmbeddingConfig = { provider: "openai" | "ollama"; model: string };
export type EmbeddingSettings = { EMBEDDING_PROVIDER?: string; EMBEDDING_MODEL?: string };
export type EmbeddingReason =
  | "EMBEDDING_CONFIG_INVALID"
  | "EMBEDDING_SCHEMA_MISMATCH"
  | "EMBEDDING_OUTPUT_INVALID"
  | "EMBEDDING_DATA_INVALID";

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
    readonly reason: "EMBEDDING_OUTPUT_INVALID" | "EMBEDDING_DATA_INVALID",
    config?: EmbeddingConfig,
    actualDimensions?: number | null,
  ) {
    super("Embedding data is incompatible. Ask an administrator to check the model and rebuild the affected embeddings.");
    console.error(JSON.stringify(embeddingDiagnostic(config, { reason, actual_dimensions: actualDimensions })));
  }
}

export function resolveEmbeddingConfig(env: EmbeddingSettings): EmbeddingConfig {
  const provider = env.EMBEDDING_PROVIDER?.trim().toLowerCase() || "openai";
  if (provider !== "openai" && provider !== "ollama") {
    throw new EmbeddingConfigurationError("EMBEDDING_CONFIG_INVALID", "Unsupported embedding provider. Configure openai or ollama.");
  }
  const model = env.EMBEDDING_MODEL?.trim() || (provider === "openai" ? DEFAULT_EMBEDDING_MODEL : "");
  if (!model) {
    throw new EmbeddingConfigurationError("EMBEDDING_CONFIG_INVALID", "EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama.");
  }
  return { provider, model };
}

export function validateEmbedding(
  value: unknown,
  reason: "EMBEDDING_OUTPUT_INVALID" | "EMBEDDING_DATA_INVALID" = "EMBEDDING_OUTPUT_INVALID",
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

/** Empty arrays represent an ungenerated concept; malformed stored data does not. */
export function parseStoredEmbedding(value: unknown): number[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); }
    catch { throw new EmbeddingValidationError("EMBEDDING_DATA_INVALID"); }
  }
  if (parsed == null || (Array.isArray(parsed) && parsed.length === 0)) return [];
  return validateEmbedding(parsed, "EMBEDDING_DATA_INVALID");
}
