import { z } from "zod";

const id = z.number().int().positive();
const videoId = z.object({ videoId: id });
const conceptId = videoId.extend({ conceptId: id });
const edgeId = videoId.extend({ edgeId: id });
const waypoint = z.object({
  start_sec: z.number().optional(),
  end_sec: z.number().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  label: z.string().optional(),
});

export const plogInputSchemas = {
  "plog.graph": videoId,
  "plog.learnerState": videoId,
  "plog.resetLearnerState": videoId,
  "plog.rebuild": videoId,
  "plog.createConcept": videoId.extend({
    label: z.string().trim().min(1, "label is required"),
    nodeType: z.string().optional(),
    introSec: z.number().optional(),
    sourceQuote: z.string().optional(),
  }),
  "plog.updateConcept": conceptId.extend({
    label: z.string().optional(),
    nodeType: z.string().optional(),
    introSec: z.number().optional(),
    sourceQuote: z.string().optional(),
  }),
  "plog.deleteConcept": conceptId,
  "plog.mergeConcepts": videoId.extend({ survivorId: id, absorbId: id }),
  "plog.updateLearningObject": conceptId.extend({
    openingQuestion: z.string().optional(),
    hintLadder: z.array(z.string()).optional(),
    misconceptions: z.array(z.string()).optional(),
    canonicalOrder: z.array(z.string()).optional(),
    workedExamples: z.array(z.string()).optional(),
    waypoints: z.array(waypoint).optional(),
  }),
  "plog.createEdge": videoId.extend({
    sourceId: id,
    targetId: id,
    edgeType: z.string(),
    quote: z.string().optional(),
  }),
  "plog.updateEdge": edgeId.extend({
    sourceId: id.optional(),
    targetId: id.optional(),
    edgeType: z.string().optional(),
    quote: z.string().optional(),
  }).refine(({ sourceId, targetId, edgeType, quote }) => sourceId !== undefined || targetId !== undefined || edgeType !== undefined || quote !== undefined, { message: "Provide at least one edge field" }),
  "plog.deleteEdge": edgeId,
};
