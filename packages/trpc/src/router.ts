import { t } from "./init";
import { accountRouter } from "./routers/account";
import { adminRouter } from "./routers/admin";
import { billingRouter } from "./routers/billing";
import { chatRouter, evaluationRouter } from "./routers/chat";
import {
  courseMembershipsRouter,
  coursesRouter,
  membershipsRouter,
} from "./routers/courses";
import { tagsRouter } from "./routers/tags";
import { videosRouter } from "./routers/videos";

export const appRouter = t.router({
  account: accountRouter,
  admin: adminRouter,
  billing: billingRouter,
  chat: chatRouter,
  evaluation: evaluationRouter,
  courses: coursesRouter,
  courseMemberships: courseMembershipsRouter,
  memberships: membershipsRouter,
  tags: tagsRouter,
  videos: videosRouter,
});

export type AppRouter = typeof appRouter;
