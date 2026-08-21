import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { OpenApiSchema } from '@/lib/docs/openapi';

/** Loads the live OpenAPI document that the docs pages are generated from. */
export function useOpenApiSchema() {
  const [schema, setSchema] = useState<OpenApiSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abortController = new AbortController();

    const loadSchema = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getSchema<OpenApiSchema>(abortController.signal);
        setSchema(data);
      } catch (caughtError) {
        if ((caughtError as Error).name === 'AbortError') return;
        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load schema');
      } finally {
        setLoading(false);
      }
    };

    loadSchema();
    return () => abortController.abort();
  }, []);

  return { schema, error, loading };
}
