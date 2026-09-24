/** Starts an SSE or JSON response, then stalls until the upstream signal aborts. */
export function stalledChatResponse(signal: AbortSignal, onWaiting: () => void, streaming = true): Response {
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const abort = () => controller.error(signal.reason);
        if (signal.aborted) abort();
        else signal.addEventListener("abort", abort, { once: true });
      },
      pull(controller) {
        if (sent) {
          // The first token has been consumed; headers have already arrived.
          onWaiting();
          return;
        }
        sent = true;
        controller.enqueue(new TextEncoder().encode(
          streaming
            ? 'data: {"choices":[{"delta":{"role":"assistant","content":"partial"}}]}\n\n'
            : '{"choices":[{"message":{"role":"assistant","content":"partial',
        ));
      },
    }),
    { headers: { "content-type": streaming ? "text/event-stream" : "application/json" } },
  );
}
