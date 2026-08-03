import { z } from "../../shared/openapi";
import { paginationQuerySchema } from "../../shared/pagination";

export const evaluationGroupParamSchema = z.object({
  groupId: z.coerce.number().int().positive(),
});

export const evaluationSummarySchema = z
  .object({
    group_id: z.number().int(),
    evaluated_count: z.number().int(),
    avg_faithfulness: z.number().nullable(),
    avg_answer_relevancy: z.number().nullable(),
    avg_context_precision: z.number().nullable(),
  })
  .openapi("EvaluationSummary");

export const evaluationLogSchema = z
  .object({
    chat_log_id: z.number().int(),
    status: z.string(),
    faithfulness: z.number().nullable(),
    answer_relevancy: z.number().nullable(),
    context_precision: z.number().nullable(),
    error_message: z.string().nullable(),
    evaluated_at: z.string().nullable(),
  })
  .openapi("EvaluationLog");

export const evaluationLogsQuerySchema = paginationQuerySchema;
