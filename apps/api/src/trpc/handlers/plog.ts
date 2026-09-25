import type { Context } from "hono";
import * as plogService from "../../features/plog/service";
import type { AppEnv } from "../../types/bindings";
import { requireUserId, rpcError, type HandlersFor } from "./shared";

async function requireOwnedVideo(
  c: Context<AppEnv>,
  videoId: number,
  userId: string,
): Promise<void> {
  const owner = await plogService.requireOwnedVideo(c.env, videoId, userId);
  if ("notFound" in owner) {
    return rpcError("NOT_FOUND", "Video not found.", { appCode: "VALIDATION_ERROR" });
  }
}

function editResult<T>(result: plogService.EditResult<T>): T {
  if (!result.ok) {
    return rpcError(result.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", result.message, {
      appCode: "VALIDATION_ERROR",
    });
  }
  return result.value;
}

export function plogHandlers(
  c: Context<AppEnv>,
  authenticatedUserId: string | null,
): HandlersFor<"plog"> {
  const userId = () => requireUserId(authenticatedUserId);
  return {
    "plog.graph": async ({ videoId }) => {
      const result = await plogService.graphForVideo(c.env, videoId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Video not found.");
      return result;
    },
    "plog.learnerState": async ({ videoId }) => {
      const result = await plogService.learnerStateForVideo(c.env, videoId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Video not found.");
      return result;
    },
    "plog.resetLearnerState": async ({ videoId }) => {
      const result = await plogService.resetLearnerForVideo(c.env, videoId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", "Video not found.");
      return { deleted: result.deleted };
    },
    "plog.rebuild": async ({ videoId }) => {
      const result = await plogService.rebuildPlog(c.env, videoId, userId());
      if ("notFound" in result) return rpcError("NOT_FOUND", result.notFound ?? "Not found");
      return { video_id: result.video_id, status: result.status, job_id: result.job_id };
    },
    "plog.createConcept": async ({ videoId, label, nodeType, introSec, sourceQuote }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editCreateConcept(c.env, videoId, {
        label,
        nodeType: nodeType ?? "object",
        introSec: introSec ?? 0,
        sourceQuote: sourceQuote ?? "",
      }));
    },
    "plog.updateConcept": async ({ videoId, conceptId, label, nodeType, introSec, sourceQuote }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editUpdateConcept(c.env, videoId, conceptId, {
        label,
        nodeType,
        introSec,
        sourceQuote,
      }));
    },
    "plog.deleteConcept": async ({ videoId, conceptId }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editDeleteConcept(c.env, videoId, conceptId));
    },
    "plog.mergeConcepts": async ({ videoId, survivorId, absorbId }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editMergeConcepts(c.env, videoId, survivorId, absorbId));
    },
    "plog.updateLearningObject": async ({
      videoId,
      conceptId,
      openingQuestion,
      hintLadder,
      misconceptions,
      canonicalOrder,
      workedExamples,
      waypoints,
    }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editUpdateLearningObject(c.env, videoId, conceptId, {
        openingQuestion,
        hintLadder,
        misconceptions,
        canonicalOrder,
        workedExamples,
        waypoints,
      }));
    },
    "plog.createEdge": async ({ videoId, sourceId, targetId, edgeType, quote }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editCreateEdge(c.env, videoId, {
        sourceId,
        targetId,
        edgeType,
        quote: quote ?? "",
      }));
    },
    "plog.updateEdge": async ({ videoId, edgeId, sourceId, targetId, edgeType, quote }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editUpdateEdge(c.env, videoId, edgeId, {
        sourceId,
        targetId,
        edgeType,
        quote,
      }));
    },
    "plog.deleteEdge": async ({ videoId, edgeId }) => {
      await requireOwnedVideo(c, videoId, userId());
      return editResult(await plogService.editDeleteEdge(c.env, videoId, edgeId));
    },
  };
}
