import {
  enqueueReindexAllEmbeddings,
} from "../../lib/jobs";
import { processExternalTaskById } from "../../lib/external-tasks";
import {
  getAdminUser,
  listAdminUsers,
  lockUserForHardDelete,
  patchAdminUserQuota,
  patchAdminUserUsage,
  updateAdminUser,
  isSuperuser as repositoryIsSuperuser,
  type FlagsPatch,
  type QuotaPatch,
  type UsagePatch,
} from "../../repositories/admin-repository";
import { createAuth } from "../../lib/auth";
import type { Bindings } from "../../types/bindings";

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
  headers: Headers,
) {
  if (
    actorUserId === targetUserId &&
    (patch.is_active === false || patch.is_superuser === false)
  ) {
    return { selfLockout: true as const };
  }

  const user = await updateAdminUser(env, targetUserId, async tx => {
    const auth = createAuth(env, tx);
    if (patch.is_active !== undefined) {
      const input = { body: { userId: targetUserId }, headers };
      if (patch.is_active) await auth.api.unbanUser(input);
      else await auth.api.banUser(input);
    }
    if (patch.is_superuser !== undefined) {
      await auth.api.setRole({
        body: { userId: targetUserId, role: patch.is_superuser ? "admin" : "user" }, headers,
      });
    }
    if (patch.is_staff !== undefined) {
      await auth.api.adminUpdateUser({
        body: { userId: targetUserId, data: { isStaff: patch.is_staff } }, headers,
      });
    }
  });
  return user ? { user } as const : { notFound: true as const };
}

export async function enqueueReindexAll(env: Bindings) {
  const jobId = await enqueueReindexAllEmbeddings(env);
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
  const locked = await lockUserForHardDelete(env, targetUserId);
  if (!("taskId" in locked)) return locked;
  await processExternalTaskById(env, locked.taskId);
  return { job_id: locked.jobId } as const;
}
