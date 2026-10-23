type EmbeddingConfigCase = {
  env: Record<string, string>;
  expected?: { provider: "openai"; model: string };
  error?: "EMBEDDING_CONFIG_INVALID";
};

export const embeddingConfigCases: EmbeddingConfigCase[] = [
  { env: {}, expected: { provider: "openai", model: "text-embedding-3-small" } },
  { env: { EMBEDDING_PROVIDER: "  ", EMBEDDING_MODEL: "  " }, expected: { provider: "openai", model: "text-embedding-3-small" } },
  { env: { EMBEDDING_PROVIDER: " OPENAI ", EMBEDDING_MODEL: " CustomModel " }, expected: { provider: "openai", model: "CustomModel" } },
  { env: { EMBEDDING_PROVIDER: " Ollama ", EMBEDDING_MODEL: " qwen3-embedding:4b " }, error: "EMBEDDING_CONFIG_INVALID" },
  { env: { EMBEDDING_PROVIDER: "ollama" }, error: "EMBEDDING_CONFIG_INVALID" },
  { env: { EMBEDDING_PROVIDER: "ollama", EMBEDDING_MODEL: "  " }, error: "EMBEDDING_CONFIG_INVALID" },
  { env: { EMBEDDING_PROVIDER: "unknown" }, error: "EMBEDDING_CONFIG_INVALID" },
];
