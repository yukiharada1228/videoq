/** Sends one SSE token, then stalls until the upstream signal aborts. */
export function stalledChatResponse(signal: AbortSignal, onWaiting: () => void): Response {
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
          'data: {"choices":[{"delta":{"role":"assistant","content":"partial"}}]}\n\n',
        ));
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}
