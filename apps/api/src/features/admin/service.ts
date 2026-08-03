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
import type { Bindings } from "../../types/bindings";

export function isSuperuser(env: Bindings, userId: number) {
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

export async function getUser(env: Bindings, id: number) {
  return getAdminUser(env, id);
}

export async function patchQuota(
  env: Bindings,
  id: number,
  patch: QuotaPatch,
) {
  return patchAdminUserQuota(env, id, patch);
}

export async function patchUsage(
  env: Bindings,
  id: number,
  patch: UsagePatch,
) {
  return patchAdminUserUsage(env, id, patch);
}

export async function patchFlags(
  env: Bindings,
  actorUserId: number,
  targetUserId: number,
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
  return { user } as const;
}

export async function enqueueReindexAll(env: Bindings) {
  const jobId = await enqueueReindexAllEmbeddings(env);
  if (!jobId) return { unavailable: true } as const;
  return { job_id: jobId } as const;
}

export async function deleteUser(
  env: Bindings,
  actorUserId: number,
  targetUserId: number,
) {
  if (actorUserId === targetUserId) {
    return { self: true } as const;
  }
  const target = await getAdminUser(env, targetUserId);
  if (!target) return { notFound: true } as const;
  if (target.is_superuser) return { forbiddenSuperuser: true } as const;

  const locked = await lockUserForHardDelete(env, targetUserId);
  if (!locked) return { notFound: true } as const;

  const jobId = await enqueueAccountDeletion(env, targetUserId);
  if (jobId) return { job_id: jobId } as const;

  // SQS misconfig / SendMessage failure used to throw 500 after lock.
  // Fall back to in-request hard-delete so Admin can still remove users.
  const deleted = await hardDeleteUser(env, targetUserId);
  if (!deleted) return { notFound: true } as const;
  return { job_id: `sync-${crypto.randomUUID()}` } as const;
}
