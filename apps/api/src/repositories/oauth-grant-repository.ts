import { and, eq } from "drizzle-orm";
import type { Db } from "../db/pool";
import { oauthClient, oauthConsent } from "../db/schema";

/** Re-read the grant for every MCP request, including already-issued JWTs. */
export async function isOAuthGrantActive(
  db: Db,
  userId: string,
  clientId: string,
  grantId: string,
  scopes: ReadonlySet<string>,
): Promise<boolean> {
  const [grant] = await db
    .select({ scopes: oauthConsent.scopes, disabled: oauthClient.disabled })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(
      and(
        eq(oauthConsent.id, grantId),
        eq(oauthConsent.userId, userId),
        eq(oauthConsent.clientId, clientId),
      ),
    )
    .limit(1);
  return Boolean(
    grant && !grant.disabled &&
    [...scopes].every((scope) => grant.scopes.includes(scope)),
  );
}
