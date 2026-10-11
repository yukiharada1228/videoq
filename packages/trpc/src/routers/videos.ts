import { protectedProcedure, t } from "../init";
import { videosInputSchemas } from "../inputs/videos";
import { outputSchemas } from "../outputs";

export const videosRouter = t.router({
  list: protectedProcedure
    .input(videosInputSchemas["videos.list"])
    .output(outputSchemas["videos.list"])
    .query(({ ctx, input }) => ctx.call("videos.list", input)),
  statusCounts: protectedProcedure
    .output(outputSchemas["videos.statusCounts"])
    .query(({ ctx }) => ctx.call("videos.statusCounts", undefined)),
  get: protectedProcedure
    .input(videosInputSchemas["videos.get"])
    .output(outputSchemas["videos.get"])
    .query(({ ctx, input }) => ctx.call("videos.get", input)),
  requestUpload: protectedProcedure
    .input(videosInputSchemas["videos.requestUpload"])
    .output(outputSchemas["videos.requestUpload"])
    .mutation(({ ctx, input }) => ctx.call("videos.requestUpload", input)),
  confirmUpload: protectedProcedure
    .input(videosInputSchemas["videos.confirmUpload"])
    .output(outputSchemas["videos.confirmUpload"])
    .mutation(({ ctx, input }) => ctx.call("videos.confirmUpload", input)),
  uploadPartUrl: protectedProcedure
    .input(videosInputSchemas["videos.uploadPartUrl"])
    .output(outputSchemas["videos.uploadPartUrl"])
    .mutation(({ ctx, input }) => ctx.call("videos.uploadPartUrl", input)),
  resumeUpload: protectedProcedure
    .input(videosInputSchemas["videos.resumeUpload"])
    .output(outputSchemas["videos.resumeUpload"])
    .mutation(({ ctx, input }) => ctx.call("videos.resumeUpload", input)),
  listResumableUploads: protectedProcedure
    .output(outputSchemas["videos.listResumableUploads"])
    .query(({ ctx }) => ctx.call("videos.listResumableUploads", undefined)),
  completeMultipartUpload: protectedProcedure
    .input(videosInputSchemas["videos.completeMultipartUpload"])
    .output(outputSchemas["videos.completeMultipartUpload"])
    .mutation(({ ctx, input }) => ctx.call("videos.completeMultipartUpload", input)),
  abortUpload: protectedProcedure
    .input(videosInputSchemas["videos.abortUpload"])
    .output(outputSchemas["videos.abortUpload"])
    .mutation(({ ctx, input }) => ctx.call("videos.abortUpload", input)),
  createYoutube: protectedProcedure
    .input(videosInputSchemas["videos.createYoutube"])
    .output(outputSchemas["videos.createYoutube"])
    .mutation(({ ctx, input }) => ctx.call("videos.createYoutube", input)),
  update: protectedProcedure
    .input(videosInputSchemas["videos.update"])
    .output(outputSchemas["videos.update"])
    .mutation(({ ctx, input }) => ctx.call("videos.update", input)),
  delete: protectedProcedure
    .input(videosInputSchemas["videos.delete"])
    .output(outputSchemas["videos.delete"])
    .mutation(({ ctx, input }) => ctx.call("videos.delete", input)),
});
