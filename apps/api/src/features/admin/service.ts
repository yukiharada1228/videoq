import {
  enqueueAccountDeletion,
  enqueueReindexAllEmbeddings,
} from "../../lib/jobs";
import {
  getAdminUser,
  hardDeleteUser,
  listAdminUsers,
  lockUserForHardDelete,
  patchAdminUserFlags,
  patchAdminUserQuota,
  patchAdminUserUsage,
  isSuperuser as repositoryIsSuperuser,
  type FlagsPatch,
  type QuotaPatch,
  type UsagePatch,
} from "../../repositories/admin-repository";
import { and, eq, isNull } from "drizzle-orm";
import { withDb } from "../../db/pool";
import {
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
  session,
} from "../../db/schema";
import type { Bindings } from "../../types/bindings";

async function revokeAuthMaterialForUser(env: Bindings, userId: string) {
  await withDb(env, async (db) => {
    await db.delete(session).where(eq(session.userId, userId));
    await db.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId));
    await db
      .update(oauthRefreshToken)
      .set({ revoked: new Date().toISOString() })
      .where(
        and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)),
      );
    await db.delete(oauthConsent).where(eq(oauthConsent.userId, userId));
  });
}

export function isSuperuser(env: Bindings, userId: string) {
  return repositoryIsSuperuser(env, userId);
}

export async function listUsers(
  env: Bindings,
  q: string,
  limit: number,
  offset: number,
) {
  return listAdminUsers(env, q, limit, offset);
}

export async function getUser(env: Bindings, id: string) {
  return getAdminUser(env, id);
}

export async function patchQuota(
  env: Bindings,
  id: string,
  patch: QuotaPatch,
) {
  return patchAdminUserQuota(env, id, patch);
}

export async function patchUsage(
  env: Bindings,
  id: string,
  patch: UsagePatch,
) {
  return patchAdminUserUsage(env, id, patch);
}

export async function patchFlags(
  env: Bindings,
  actorUserId: string,
  targetUserId: string,
  patch: FlagsPatch,
) {
  if (
    actorUserId === targetUserId &&
    (patch.is_active === false || patch.is_superuser === false)
  ) {
    return { selfLockout: true as const };
  }

  const user = await patchAdminUserFlags(env, targetUserId, patch);
  if (!user) return { notFound: true as const };
  // Sessions are deleted in the repository; drop OAuth/MCP tokens too.
  if (patch.is_active === false) {
    await revokeAuthMaterialForUser(env, targetUserId);
  }
  return { user } as const;
}

export async function enqueueReindexAll(env: Bindings) {
  const jobId = await enqueueReindexAllEmbeddings(env);
  if (!jobId) return { unavailable: true } as const;
  return { job_id: jobId } as const;
}

export async function deleteUser(
  env: Bindings,
  actorUserId: string,
  targetUserId: string,
) {
  if (actorUserId === targetUserId) {
    return { self: true } as const;
  }
  const target = await getAdminUser(env, targetUserId);
  if (!target) return { notFound: true } as const;
  if (target.is_superuser) return { forbiddenSuperuser: true } as const;

  const locked = await lockUserForHardDelete(env, targetUserId);
  if (!locked) return { notFound: true } as const;
  await revokeAuthMaterialForUser(env, targetUserId);

  const jobId = await enqueueAccountDeletion(env, targetUserId);
  if (jobId) return { job_id: jobId } as const;

  // SQS misconfig / SendMessage failure used to throw 500 after lock.
  // Fall back to in-request hard-delete so Admin can still remove users.
  const deleted = await hardDeleteUser(env, targetUserId);
  if (!deleted) return { notFound: true } as const;
  return { job_id: `sync-${crypto.randomUUID()}` } as const;
}
