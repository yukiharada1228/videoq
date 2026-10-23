/** OpenAI-compatible wire differences stay inside the provider adapter. */
import OpenAI from "openai";
import { tokenCost } from "./inference-cost";
import type { AnswerCostLedger } from "./answer-cost-ledger";
import { inferenceBackoff, isTransientInferenceError, providerStatus, OPENAI_BASE_URL, OPENAI_FALLBACK_MODEL, type LlmRoute } from "./inference-provider";

type Request = OpenAI.Chat.ChatCompletionCreateParams;
type Result = OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

export class ChatTransport {
  private fallback = false;
  constructor(readonly route: LlmRoute, private readonly openaiKey?: string,
    private readonly ledger?: AnswerCostLedger) {}

  toolDecision(request: Request): Request {
    if (this.route.provider !== "groq" || request.response_format?.type !== "json_schema") return request;
    // GPT-OSS may express its terminal JSON as a function named "json" even
    // when asked for plain content. Admit that name only as an internal stop
    // signal. Its generated arguments are discarded, never executed or used
    // to repair/convert the final answer.
    return { ...request, tools: [...(request.tools ?? []), { type: "function", function: {
      name: "json", description: "Finish retrieval. The application generates the final structured answer separately. No external action.",
      parameters: request.response_format.json_schema.schema,
    } }] };
  }

  isTerminalTool(name: string): boolean { return this.route.provider === "groq" && name === "json"; }

  private adapt(request: Request, route: LlmRoute): Request {
    const wire = { ...request, model: route.model };
    if (route.provider !== "groq") {
      if (this.route.provider === "groq") {
        // Reasoning fields and Groq-only kwargs must never reach GPT-4o-mini.
        delete wire.reasoning_effort;
        delete (wire as Request & { include_reasoning?: boolean }).include_reasoning;
      }
      return wire;
    }
    const maxTokens = wire.max_completion_tokens ?? wire.max_tokens ?? 1024;
    delete wire.max_tokens;
    wire.max_completion_tokens = Math.max(4096, maxTokens);
    wire.reasoning_effort ??= "low";
    Object.assign(wire, { include_reasoning: false });
    if (wire.tools?.length) {
      wire.parallel_tool_calls = false;
      // Keep original application prompts intact; scope this wire-only turn.
      wire.messages = [...wire.messages, { role: "system", content:
        "This request only selects retrieval tools. Call only exact function names listed in tools. " +
        "When the evidence is sufficient, return plain assistant text or call json to finish retrieval; " +
        "the application requests the final structured answer separately. Do not put the final answer in a function call." }];
    }
    if (wire.stream && wire.response_format?.type === "json_schema") {
      // Groq cannot stream json_schema. Keep native JSON streaming, then apply
      // the same incremental parser and final Zod/citation validation as before.
      // Original prompts and evidence remain unchanged; add formatting only.
      const format = wire.response_format;
      wire.response_format = { type: "json_object" };
      wire.messages = [{ role: "system", content: "Return only a JSON object matching this response schema. Never include reasoning or prose outside JSON. JSON-encode each string exactly once: after JSON decoding, paragraph breaks must be actual newlines and TeX commands must have their normal single backslash, not double-encoded escapes. Schema: " + JSON.stringify(format.json_schema.schema) }, ...wire.messages];
    }
    return wire;
  }

  async create(request: Request, options: OpenAI.RequestOptions): Promise<Result> {
    const candidates: LlmRoute[] = this.route.provider === "groq"
      ? [...(this.fallback ? [] : [this.route, this.route]),
        { provider: "openai", model: OPENAI_FALLBACK_MODEL, apiKey: this.openaiKey!, baseURL: OPENAI_BASE_URL }]
      : [this.route];
    const ledger = this.ledger;
    const self = this;
    async function attempt(route: LlmRoute): Promise<Result> {
      options.signal?.throwIfAborted();
      const wire = self.adapt(request, route);
      const started = Date.now();
      const timeout = route.provider === "local" ? options.timeout ?? 120_000 : Math.min(options.timeout ?? 120_000, 30_000);
      const attemptDeadline = AbortSignal.timeout(timeout);
      const signal = options.signal ? AbortSignal.any([options.signal, attemptDeadline]) : attemptDeadline;
      const failure = (error: unknown) => {
        if (attemptDeadline.aborted && !options.signal?.aborted) {
          const timeoutError = new Error("Inference attempt timed out.");
          timeoutError.name = "APIConnectionTimeoutError";
          return timeoutError;
        }
        return error;
      };
      let firstTokenMs: number | null = null;
      let usage: unknown;
      const call = ledger?.begin("answer_model", route.model, route.provider);
      let finished = false;
      const finish = (status: "completed" | "failed" | "interrupted", error?: unknown) => {
        if (finished) return;
        finished = true;
        call?.[status === "completed" ? "complete" : status === "failed" ? "fail" : "interrupt"](usage);
        console.info(JSON.stringify({ event: "llm_provider_call", provider: route.provider,
          durationMs: Date.now() - started, ttftMs: firstTokenMs, status, httpStatus: providerStatus(error), estimatedCostUsd: tokenCost(route.provider, route.model, usage) }));
      };
      try {
        const client = new OpenAI({ apiKey: route.apiKey, baseURL: route.baseURL,
          timeout, maxRetries: 0 });
        const response = await client.chat.completions.create(wire, { ...options, signal, timeout, maxRetries: 0 });
        if (!request.stream) {
          usage = (response as OpenAI.Chat.Completions.ChatCompletion).usage;
          finish("completed");
          return response;
        }
        return (async function* () {
          let completed = false;
          try {
            for await (const chunk of response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
              if (chunk.usage) usage = chunk.usage;
              else {
                const groq = chunk as typeof chunk & { x_groq?: { usage?: unknown } };
                if (groq.x_groq?.usage) usage = groq.x_groq.usage;
              }
              if (firstTokenMs === null && chunk.choices.some(c => c.delta.content || c.delta.tool_calls?.length)) {
                firstTokenMs = Date.now() - started;
                call?.firstToken();
              }
              yield chunk;
            }
            completed = true;
            finish("completed");
          } catch (error) { finish(options.signal?.aborted ? "interrupted" : "failed", error); throw failure(error); }
          finally { if (!completed) { (response as { controller?: AbortController }).controller?.abort(); finish("interrupted"); } }
        })();
      } catch (error) { finish(options.signal?.aborted ? "interrupted" : "failed", error); throw failure(error); }
    }
    if (request.stream) {
      return (async function* () {
        for (let i = 0; i < candidates.length; i++) {
          let emitted = false;
          try {
            const result = await attempt(candidates[i]);
            for await (const chunk of result as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
              emitted = true;
              yield chunk;
            }
            if (candidates[i].provider === "openai" && self.route.provider === "groq") self.fallback = true;
            return;
          } catch (error) {
            // Once any model frame escapes, changing providers could duplicate
            // answer prefixes or tool calls. Propagate; never replay a stream.
            if (emitted || i === candidates.length - 1 || !isTransientInferenceError(error, options.signal)) throw error;
            await inferenceBackoff(i, options.signal);
          }
        }
      })();
    }
    for (let i = 0; i < candidates.length; i++) {
      try {
        const result = await attempt(candidates[i]);
        if (candidates[i].provider === "openai" && this.route.provider === "groq") this.fallback = true;
        return result;
      } catch (error) {
        if (i === candidates.length - 1 || !isTransientInferenceError(error, options.signal)) throw error;
        await inferenceBackoff(i, options.signal);
      }
    }
    throw new Error("No inference route");
  }
}
