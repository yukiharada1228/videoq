export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export const supportedMethods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

export type OpenApiSchemaObject = {
  type?: string;
  format?: string;
  enum?: string[];
  properties?: Record<string, OpenApiSchemaObject>;
  required?: string[];
  items?: OpenApiSchemaObject;
  oneOf?: OpenApiSchemaObject[];
  anyOf?: OpenApiSchemaObject[];
  allOf?: OpenApiSchemaObject[];
  additionalProperties?: OpenApiSchemaObject | boolean;
  $ref?: string;
};

export type OpenApiParameter = {
  in?: 'path' | 'query' | 'header' | 'cookie';
  name?: string;
  required?: boolean;
  schema?: OpenApiSchemaObject;
};

export type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: OpenApiSchemaObject;
      };
      'multipart/form-data'?: {
        schema?: OpenApiSchemaObject;
      };
    };
  };
};

export type OpenApiSchema = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchemaObject>;
  };
};

export type OpenApiOperationEntry = {
  method: HttpMethod;
  path: string;
  operation: OpenApiOperation;
};

/** Flattens `paths` into one entry per method, sorted by path then method. */
export function listOperations(schema: OpenApiSchema | null): OpenApiOperationEntry[] {
  if (!schema?.paths) return [];

  const entries: OpenApiOperationEntry[] = [];

  Object.entries(schema.paths).forEach(([path, methods]) => {
    supportedMethods.forEach((method) => {
      const operation = methods[method];
      if (!operation) return;
      entries.push({ method, path, operation });
    });
  });

  return entries.sort((left, right) => {
    const pathCompare = left.path.localeCompare(right.path);
    if (pathCompare !== 0) return pathCompare;
    return left.method.localeCompare(right.method);
  });
}
