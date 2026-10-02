import type { RpcInputMap } from "@videoq/trpc";
import {
  enqueueReindexAllEmbeddings,
} from "../../lib/jobs";
import { processExternalTaskById } from "../../lib/external-tasks";
import {
  lockUserForHardDelete,
  updateAdminUser,
} from "../../repositories/admin-repository";
import { createAuth } from "../../lib/auth";
import type { Bindings } from "../../types/bindings";

export {
  isAdmin,
  listAdminUsers as listUsers,
  getAdminUser as getUser,
  patchAdminUserQuota as patchQuota,
  patchAdminUserUsage as patchUsage,
} from "../../repositories/admin-repository";

export async function patchFlags(
  env: Bindings,
  actorUserId: string,
  targetUserId: string,
  patch: Omit<RpcInputMap["admin.patchFlags"], "id">,
  headers: Headers,
) {
  if (
    actorUserId === targetUserId &&
    (patch.is_active === false || patch.is_admin === false)
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
    if (patch.is_admin !== undefined) {
      await auth.api.setRole({
        body: { userId: targetUserId, role: patch.is_admin ? "admin" : "user" }, headers,
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
