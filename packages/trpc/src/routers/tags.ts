import { protectedProcedure, t } from "../init";
import { tagsInputSchemas } from "../inputs/tags";
import { outputSchemas } from "../outputs";

export const tagsRouter = t.router({
  list: protectedProcedure
    .input(tagsInputSchemas["tags.list"])
    .output(outputSchemas["tags.list"])
    .query(({ ctx, input }) => ctx.call("tags.list", input)),
  get: protectedProcedure
    .input(tagsInputSchemas["tags.get"])
    .output(outputSchemas["tags.get"])
    .query(({ ctx, input }) => ctx.call("tags.get", input)),
  create: protectedProcedure
    .input(tagsInputSchemas["tags.create"])
    .output(outputSchemas["tags.create"])
    .mutation(({ ctx, input }) => ctx.call("tags.create", input)),
  update: protectedProcedure
    .input(tagsInputSchemas["tags.update"])
    .output(outputSchemas["tags.update"])
    .mutation(({ ctx, input }) => ctx.call("tags.update", input)),
  delete: protectedProcedure
    .input(tagsInputSchemas["tags.delete"])
    .output(outputSchemas["tags.delete"])
    .mutation(({ ctx, input }) => ctx.call("tags.delete", input)),
});
