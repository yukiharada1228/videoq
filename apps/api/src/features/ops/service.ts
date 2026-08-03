import { enqueueReindexAllEmbeddings } from "../../lib/jobs";
import {
  getOpsUser,
  listOpsUsers,
  patchOpsUserQuota,
  patchOpsUserUsage,
  isSuperuser as repositoryIsSuperuser,
  type QuotaPatch,
  type UsagePatch,
} from "../../repositories/ops-repository";
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
  return listOpsUsers(env, q, limit, offset);
}

export async function getUser(env: Bindings, id: number) {
  return getOpsUser(env, id);
}

export async function patchQuota(
  env: Bindings,
  id: number,
  patch: QuotaPatch,
) {
  return patchOpsUserQuota(env, id, patch);
}

export async function patchUsage(
  env: Bindings,
  id: number,
  patch: UsagePatch,
) {
  return patchOpsUserUsage(env, id, patch);
}

export async function enqueueReindexAll(env: Bindings) {
  const jobId = await enqueueReindexAllEmbeddings(env);
  if (!jobId) return { unavailable: true } as const;
  return { job_id: jobId } as const;
}
