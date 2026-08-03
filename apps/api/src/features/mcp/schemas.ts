import { z } from "../../shared/openapi";

/** JSON-RPC 2.0 envelope（batch は array）。厳密検証は dispatch 側。 */
export const mcpJsonRpcSchema = z
  .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
  .openapi("McpJsonRpc");

export const mcpErrorBodySchema = z
  .object({ error: z.string() })
  .openapi("McpHttpError");
