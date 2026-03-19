import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

type DocsSection = 'auth' | 'videos' | 'chat' | 'openai';
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

type OpenApiSchema = {
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: {
    schemas?: Record<string, OpenApiSchemaObject>;
  };
};

type OpenApiOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: OpenApiSchemaObject;
      };
    };
  };
};

type OpenApiSchemaObject = {
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

type OpenApiParameter = {
  in?: 'path' | 'query' | 'header' | 'cookie';
  name?: string;
  required?: boolean;
  schema?: OpenApiSchemaObject;
};

type EndpointItem = {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  snippets: Record<SnippetTab, string>;
};

const supportedMethods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];
const snippetTabs = ['curl', 'javascript', 'typescript', 'python', 'go', 'java', 'csharp', 'php', 'ruby'] as const;
type SnippetTab = (typeof snippetTabs)[number];

function sectionMatchesPath(path: string, section: DocsSection): boolean {
  if (section === 'auth') return path.includes('/auth/');
  if (section === 'videos') return path.includes('/videos/');
  if (section === 'openai') return path.startsWith('/v1/');
  return path.includes('/chat/');
}

function resolveSchemaRef(
  schema: OpenApiSchemaObject | undefined,
  components: Record<string, OpenApiSchemaObject>,
  visited: Set<string> = new Set(),
): OpenApiSchemaObject | undefined {
  if (!schema) return undefined;
  if (!schema.$ref) return schema;

  const refName = schema.$ref.replace('#/components/schemas/', '');
  if (visited.has(refName)) return undefined;
  visited.add(refName);

  return resolveSchemaRef(components[refName], components, visited);
}

function primitiveExample(schema: OpenApiSchemaObject | undefined): string | number | boolean {
  if (!schema) return 'string';
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];
  if (schema.format === 'date-time') return '2026-01-01T00:00:00Z';
  if (schema.format === 'uuid') return '00000000-0000-0000-0000-000000000000';
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  return 'string';
}

function generateJsonExample(
  schema: OpenApiSchemaObject | undefined,
  components: Record<string, OpenApiSchemaObject>,
): unknown {
  const resolved = resolveSchemaRef(schema, components);
  if (!resolved) return {};

  if (resolved.oneOf && resolved.oneOf.length > 0) {
    return generateJsonExample(resolved.oneOf[0], components);
  }
  if (resolved.anyOf && resolved.anyOf.length > 0) {
    return generateJsonExample(resolved.anyOf[0], components);
  }
  if (resolved.allOf && resolved.allOf.length > 0) {
    return generateJsonExample(resolved.allOf[0], components);
  }

  if (resolved.type === 'array') {
    return [generateJsonExample(resolved.items, components)];
  }

  if (resolved.type === 'object' || resolved.properties) {
    const obj: Record<string, unknown> = {};
    const properties = resolved.properties || {};

    Object.entries(properties).forEach(([key, value]) => {
      obj[key] = generateJsonExample(value, components);
    });

    return obj;
  }

  return primitiveExample(resolved);
}

function buildCurlExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const lines: string[] = [`curl -X ${method.toUpperCase()} \\`, '  -H "Accept: application/json" \\'];

  if (includeApiKeyHeader) {
    lines.push('  -H "X-API-Key: vq_your_key_here" \\');
  }

  if (body !== null) {
    lines.push('  -H "Content-Type: application/json" \\');
    lines.push(`  -d '${JSON.stringify(body, null, 2).replace(/\n/g, '\\n')}' \\`);
  }

  lines.push(`  ${url}`);
  return lines.join('\n');
}

function buildJavaScriptExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (includeApiKeyHeader) headers['X-API-Key'] = 'vq_your_key_here';
  if (body !== null) headers['Content-Type'] = 'application/json';

  const lines: string[] = [
    `const response = await fetch("${url}", {`,
    `  method: "${method.toUpperCase()}",`,
    `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`,
  ];
  if (body !== null) {
    lines.push(`  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')}),`);
  }
  lines.push('});');
  lines.push('');
  lines.push('const text = await response.text();');
  lines.push('console.log(response.status, text);');
  return lines.join('\n');
}

function buildPythonExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (includeApiKeyHeader) headers['X-API-Key'] = 'vq_your_key_here';
  if (body !== null) headers['Content-Type'] = 'application/json';

  const lines: string[] = [
    'import requests',
    '',
    `url = "${url}"`,
    `headers = ${JSON.stringify(headers, null, 2)}`,
  ];

  if (body !== null) {
    lines.push(`payload = ${JSON.stringify(body, null, 2)}`);
    lines.push(
      `response = requests.${method}(url, headers=headers, json=payload, timeout=30)`,
    );
  } else {
    lines.push(`response = requests.${method}(url, headers=headers, timeout=30)`);
  }

  lines.push('print(response.status_code)');
  lines.push('print(response.text)');
  return lines.join('\n');
}

function buildTypescriptExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  return buildJavaScriptExample(method, url, includeApiKeyHeader, body);
}

function buildGoExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const bodyLiteral = body !== null ? JSON.stringify(body, null, 2).replace(/`/g, '\\`') : '';
  const lines: string[] = [
    'client := &http.Client{Timeout: 30 * time.Second}',
  ];
  if (body !== null) {
    lines.push(`payload := strings.NewReader(\`${bodyLiteral}\`)`);
    lines.push(`req, err := http.NewRequest("${method.toUpperCase()}", "${url}", payload)`);
  } else {
    lines.push(`req, err := http.NewRequest("${method.toUpperCase()}", "${url}", nil)`);
  }
  lines.push('if err != nil {');
  lines.push('  log.Fatal(err)');
  lines.push('}');
  lines.push('req.Header.Set("Accept", "application/json")');
  if (includeApiKeyHeader) lines.push('req.Header.Set("X-API-Key", "vq_your_key_here")');
  if (body !== null) lines.push('req.Header.Set("Content-Type", "application/json")');
  lines.push('resp, err := client.Do(req)');
  lines.push('if err != nil {');
  lines.push('  log.Fatal(err)');
  lines.push('}');
  lines.push('defer resp.Body.Close()');
  lines.push('b, _ := io.ReadAll(resp.Body)');
  lines.push('fmt.Println(resp.StatusCode, string(b))');
  return lines.join('\n');
}

function buildJavaExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const bodyLiteral = body !== null ? JSON.stringify(body, null, 2).replace(/"/g, '\\"') : '';
  const lines: string[] = [
    'HttpClient client = HttpClient.newHttpClient();',
    `HttpRequest.Builder builder = HttpRequest.newBuilder().uri(URI.create("${url}"))`,
    '    .header("Accept", "application/json")',
  ];
  if (includeApiKeyHeader) lines.push('    .header("X-API-Key", "vq_your_key_here")');
  if (body !== null) lines.push('    .header("Content-Type", "application/json")');
  if (body !== null) {
    lines.push(`    .method("${method.toUpperCase()}", HttpRequest.BodyPublishers.ofString("${bodyLiteral}"));`);
  } else {
    lines.push(`    .method("${method.toUpperCase()}", HttpRequest.BodyPublishers.noBody());`);
  }
  lines.push('HttpResponse<String> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofString());');
  lines.push('System.out.println(response.statusCode());');
  lines.push('System.out.println(response.body());');
  return lines.join('\n');
}

function buildCSharpExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const bodyLiteral = body !== null ? JSON.stringify(body, null, 2).replace(/"/g, '\\"') : '';
  const lines: string[] = [
    'using var client = new HttpClient();',
    'using var request = new HttpRequestMessage(new HttpMethod("' + method.toUpperCase() + '"), "' + url + '");',
    'request.Headers.Add("Accept", "application/json");',
  ];
  if (includeApiKeyHeader) lines.push('request.Headers.Add("X-API-Key", "vq_your_key_here");');
  if (body !== null) {
    lines.push('request.Content = new StringContent("' + bodyLiteral + '", Encoding.UTF8, "application/json");');
  }
  lines.push('var response = await client.SendAsync(request);');
  lines.push('var content = await response.Content.ReadAsStringAsync();');
  lines.push('Console.WriteLine((int)response.StatusCode);');
  lines.push('Console.WriteLine(content);');
  return lines.join('\n');
}

function buildPhpExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const headerLines = ['"Accept: application/json"'];
  if (includeApiKeyHeader) headerLines.push('"X-API-Key: vq_your_key_here"');
  if (body !== null) headerLines.push('"Content-Type: application/json"');
  const bodyLiteral = body !== null ? JSON.stringify(body, null, 2).replace(/'/g, "\\'") : '';
  const lines: string[] = [
    '$ch = curl_init();',
    `curl_setopt($ch, CURLOPT_URL, '${url}');`,
    `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method.toUpperCase()}');`,
    'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);',
    `curl_setopt($ch, CURLOPT_HTTPHEADER, [${headerLines.join(', ')}]);`,
  ];
  if (body !== null) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${bodyLiteral}');`);
  lines.push('$response = curl_exec($ch);');
  lines.push('$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);');
  lines.push('curl_close($ch);');
  lines.push('echo $status . PHP_EOL;');
  lines.push('echo $response . PHP_EOL;');
  return lines.join('\n');
}

function buildRubyExample(
  method: HttpMethod,
  url: string,
  includeApiKeyHeader: boolean,
  body: unknown | null,
): string {
  const headers: Record<string, string> = { 'Accept' : 'application/json' };
  if (includeApiKeyHeader) headers['X-API-Key'] = 'vq_your_key_here';
  if (body !== null) headers['Content-Type'] = 'application/json';
  const lines: string[] = [
    'uri = URI("' + url + '")',
    'http = Net::HTTP.new(uri.host, uri.port)',
    `request = Net::HTTP::${method === 'get' ? 'Get' : method === 'post' ? 'Post' : method === 'put' ? 'Put' : method === 'patch' ? 'Patch' : 'Delete'}.new(uri)`,
    `request.initialize_http_header(${JSON.stringify(headers, null, 2)})`,
  ];
  if (body !== null) {
    lines.push(`request.body = ${JSON.stringify(JSON.stringify(body, null, 2))}`);
  }
  lines.push('response = http.request(request)');
  lines.push('puts response.code');
  lines.push('puts response.body');
  return lines.join('\n');
}

function buildEndpointSnippets(
  method: HttpMethod,
  path: string,
  operation: OpenApiOperation,
  components: Record<string, OpenApiSchemaObject>,
): EndpointItem['snippets'] {
  const pathParameters = (operation.parameters || []).filter((parameter) => parameter.in === 'path');
  const queryParameters = (operation.parameters || []).filter((parameter) => parameter.in === 'query');

  let resolvedPath = path;
  pathParameters.forEach((parameter) => {
    if (!parameter.name) return;
    const placeholder = `{${parameter.name}}`;
    resolvedPath = resolvedPath.replace(placeholder, String(primitiveExample(parameter.schema)));
  });

  const queryPairs = queryParameters
    .filter((parameter) => parameter.required && parameter.name)
    .map((parameter) => `${parameter.name}=${encodeURIComponent(String(primitiveExample(parameter.schema)))}`);

  const queryString = queryPairs.length > 0 ? `?${queryPairs.join('&')}` : '';
  const apiOrigin = new URL(API_URL, window.location.origin).origin;
  const url = `${apiOrigin}${resolvedPath}${queryString}`;
  const includeApiKeyHeader = !path.includes('/schema/');
  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  const body = bodySchema ? generateJsonExample(bodySchema, components) : null;

  return {
    curl: buildCurlExample(method, url, includeApiKeyHeader, body),
    javascript: buildJavaScriptExample(method, url, includeApiKeyHeader, body),
    typescript: buildTypescriptExample(method, url, includeApiKeyHeader, body),
    python: buildPythonExample(method, url, includeApiKeyHeader, body),
    go: buildGoExample(method, url, includeApiKeyHeader, body),
    java: buildJavaExample(method, url, includeApiKeyHeader, body),
    csharp: buildCSharpExample(method, url, includeApiKeyHeader, body),
    php: buildPhpExample(method, url, includeApiKeyHeader, body),
    ruby: buildRubyExample(method, url, includeApiKeyHeader, body),
  };
}

interface ApiEndpointListProps {
  section: DocsSection;
}

export function ApiEndpointList({ section }: ApiEndpointListProps) {
  const { t } = useTranslation();
  const [schema, setSchema] = useState<OpenApiSchema | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSnippetTab, setActiveSnippetTab] = useState<SnippetTab>('curl');

  useEffect(() => {
    const abortController = new AbortController();

    const loadSchema = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/schema/`, {
          method: 'GET',
          credentials: 'include',
          signal: abortController.signal,
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load schema (${response.status})`);
        }

        const data = (await response.json()) as OpenApiSchema;
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

  const endpoints = useMemo<EndpointItem[]>(() => {
    if (!schema?.paths) return [];

    const components = schema.components?.schemas || {};
    const items: EndpointItem[] = [];

    Object.entries(schema.paths).forEach(([path, methods]) => {
      if (!sectionMatchesPath(path, section)) return;

      supportedMethods.forEach((method) => {
        const operation = methods[method];
        if (!operation) return;

        const summary = operation.summary || `${method.toUpperCase()} ${path}`;
        items.push({
          method,
          path,
          summary,
          description: operation.description,
          snippets: buildEndpointSnippets(method, path, operation, components),
        });
      });
    });

    const sorted = items.sort((left, right) => {
      const pathCompare = left.path.localeCompare(right.path);
      if (pathCompare !== 0) return pathCompare;
      return left.method.localeCompare(right.method);
    });

    return sorted;
  }, [schema, section]);

  if (loading) {
    return <div className="text-sm text-slate-600">{t('docs.api.loading')}</div>;
  }

  if (error) {
    return <div className="text-sm text-red-600">{t('docs.api.error', { message: error })}</div>;
  }

  if (endpoints.length === 0) {
    return <div className="text-sm text-slate-600">{t('docs.api.empty')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
        {snippetTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveSnippetTab(tab)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${
              activeSnippetTab === tab
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t(`docs.api.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {endpoints.map((endpoint) => (
        <Card key={`${endpoint.method}-${endpoint.path}`}>
          <CardHeader>
            <CardTitle className="text-base">
              <span className="mr-2 rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold tracking-wide text-white">
                {endpoint.method.toUpperCase()}
              </span>
              {endpoint.summary}
            </CardTitle>
            <CardDescription className="break-all font-mono text-xs text-slate-600">
              {endpoint.path}
            </CardDescription>
            {endpoint.description && (
              <CardDescription>{endpoint.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100">
              <code>{endpoint.snippets[activeSnippetTab]}</code>
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
