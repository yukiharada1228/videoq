type EmbeddingConfigCase = {
  env: Record<string, string>;
  expected: { provider: "openai"; model: string };
};

export const embeddingConfigCases: EmbeddingConfigCase[] = [
  { env: { OPENROUTER_API_KEY: "router-key" }, expected: { provider: "openai", model: "openai/text-embedding-3-small" } },
  { env: { EMBEDDING_BASE_URL: "https://openrouter.ai/api/v1" }, expected: { provider: "openai", model: "openai/text-embedding-3-small" } },
  { env: {}, expected: { provider: "openai", model: "text-embedding-3-small" } },
  { env: { EMBEDDING_MODEL: "  " }, expected: { provider: "openai", model: "text-embedding-3-small" } },
  { env: { EMBEDDING_MODEL: " CustomModel " }, expected: { provider: "openai", model: "CustomModel" } },
];
