type Completion = { choices: Array<{ finish_reason: string; message: {
  role: string; content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
} }> };

/** Fragment content and tool arguments like the actual Chat Completions wire protocol. */
export function chatCompletionFrames(completion: Completion, id = "chatcmpl-test"): string[] {
  const choice = completion.choices[0];
  const frames: string[] = [];
  const emit = (delta: unknown, finish_reason: string | null = null) => frames.push(
    `data: ${JSON.stringify({ id, choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
  );
  emit({ role: "assistant", content: "" });
  for (const content of choice.message.content?.match(/[\s\S]{1,4}/g) ?? []) emit({ content });
  choice.message.tool_calls?.forEach((call, index) => {
    emit({ tool_calls: [{ index, id: call.id, type: call.type, function: { name: call.function.name, arguments: "" } }] });
    for (const args of call.function.arguments.match(/[\s\S]{1,4}/g) ?? []) {
      emit({ tool_calls: [{ index, function: { arguments: args } }] });
    }
  });
  emit({}, choice.finish_reason);
  frames.push(`data: ${JSON.stringify({ id, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
  frames.push("data: [DONE]\n\n");
  return frames;
}

export function chatCompletionResponse(completion: Completion, streaming: boolean, id?: string): Response {
  return new Response(streaming ? chatCompletionFrames(completion, id).join("") : JSON.stringify(completion), {
    headers: { "content-type": streaming ? "text/event-stream" : "application/json" },
  });
}
