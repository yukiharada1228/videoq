import type { Context } from "hono";
import { TRPCError } from "@trpc/server";
import type { ProcedureHandlers, TrpcContext } from "@videoq/trpc";
import * as adminService from "../features/admin/service";
import { resolveAuth, sessionMethod } from "../middleware/auth";
import type { AppEnv } from "../types/bindings";
import { accountHandlers } from "./handlers/account";
import { adminHandlers } from "./handlers/admin";
import { billingHandlers } from "./handlers/billing";
import { chatHandlers } from "./handlers/chat";
import { courseHandlers } from "./handlers/courses";
import { mediaLibraryHandlers } from "./handlers/media-library";
import { plogHandlers } from "./handlers/plog";
import { createRpcCaller } from "./handlers/shared";

/** Authenticate once and bind the request-scoped service adapters used by tRPC. */
export async function createTrpcContext(c: Context<AppEnv>): Promise<TrpcContext> {
  const auth = await resolveAuth(c, [sessionMethod]);
  const userId = auth.kind === "ok" ? auth.userId : null;

  const handlers = {
    ...accountHandlers(c, userId),
    ...adminHandlers(c, userId),
    ...billingHandlers(c, userId),
    ...chatHandlers(c, userId),
    ...courseHandlers(c, userId),
    ...mediaLibraryHandlers(c, userId),
    ...plogHandlers(c, userId),
  } satisfies ProcedureHandlers;

  return {
    userId,
    assertSuperuser: async () => {
      if (userId === null || !(await adminService.isSuperuser(c.env, userId))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        });
      }
    },
    call: createRpcCaller(handlers),
  };
}
