import { z } from "zod";
import { parsePartialJson } from "@langchain/core/output_parsers";
import { modelAnswerSchema, type ModelAnswer } from "@videoq/trpc/chat";
import { isAIMessage, type BaseMessage } from "@langchain/core/messages";
import { LlmProviderError } from "./openai";

export const answerResponseFormat = {
  type: "json_schema" as const,
  json_schema: { name: "videoq_answer", strict: true, schema: z.toJSONSchema(modelAnswerSchema) },
};

export function assertCompletedAnswer(message: BaseMessage | undefined): void {
  if (!message || !isAIMessage(message) || message.tool_calls?.length || message.invalid_tool_calls?.length
    || message.additional_kwargs.refusal || message.response_metadata.finish_reason !== "stop") {
    throw new LlmProviderError("Structured answer refused or incomplete.");
  }
}

export function parseModelAnswer(text: string): ModelAnswer {
  try {
    const answer = modelAnswerSchema.parse(JSON.parse(text));
    if (!answer.segments.some(s => s.text.trim())) throw new Error("Empty answer");
    return answer;
  } catch {
    throw new LlmProviderError("Invalid structured answer.");
  }
}

/** Only complete JSON escapes are safe to expose from a partial string. */
function stableJsonPrefix(text: string): string {
  const escape = /(?:\\u[\da-fA-F]{0,3}|\\)$/.exec(text);
  if (!escape) return text;
  let slashes = 0;
  for (let i = escape.index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 0 ? text.slice(0, escape.index) : text;
}

/** SDK partial JSON decoding, with monotonic text only; final validation remains strict. */
export class AnswerTextStream {
  private raw = "";
  private readonly emitted: string[] = [];

  push(delta: string): Array<{ segmentIndex: number; text: string }> {
    this.raw += delta;
    if (this.raw.length > 256_000) throw new LlmProviderError("Structured answer exceeded size limit.");
    let partial: unknown;
    try { partial = parsePartialJson(stableJsonPrefix(this.raw)); } catch { return []; }
    const segments = (partial as { segments?: unknown[] } | null)?.segments;
    if (!Array.isArray(segments)) return [];
    const out: Array<{ segmentIndex: number; text: string }> = [];
    segments.forEach((segment, segmentIndex) => {
      if (!segment || typeof segment !== "object" || !("text" in segment) || typeof segment.text !== "string") return;
      // A split surrogate must not be painted as a replacement glyph.
      const text = segment.text.replace(/[\uD800-\uDBFF]$/, "");
      const previous = this.emitted[segmentIndex];
      if (!text.startsWith(previous ?? "")) throw new LlmProviderError("Structured answer changed an emitted prefix.");
      if (previous === undefined || text.length > previous.length) {
        out.push({ segmentIndex, text: text.slice(previous?.length ?? 0) });
        this.emitted[segmentIndex] = text;
      }
    });
    return out;
  }

  finish(): ModelAnswer {
    const answer = parseModelAnswer(this.raw);
    if (answer.segments.some((s, i) => s.text !== (this.emitted[i] ?? ""))) {
      throw new LlmProviderError("Structured answer stream was incomplete.");
    }
    return answer;
  }
}
