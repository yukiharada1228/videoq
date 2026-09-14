import { http, HttpResponse } from 'msw';
import { fn } from 'storybook/test';
import type { ChatHistoryItem, ChatLogEvaluation, ChatRequest, ChatStreamEvent } from '../../src/lib/api';
import { answerEvents, courseHistory } from '../fixtures/chatPanel';
import { completedEvaluation } from '../fixtures/chatHistory';
import { failure, pending, success, trpcHandler, trpcMutation, trpcQuery } from './network';

export interface ChatPanelScenario {
  events?: ChatStreamEvent[];
  keepOpen?: boolean;
  httpError?: boolean;
  history?: ChatHistoryItem[];
  historyState?: 'pending' | 'error';
  evaluations?: ChatLogEvaluation[];
  feedback?: 'pending' | 'error' | 'retry';
  csv?: 'pending' | 'error';
}
export const chatRequest = fn();
export const historyRequest = fn();
export const evaluationRequest = fn();
export const feedbackRequest = fn();
export const csvRequest = fn();
export const historyError = '会話履歴を読み込めませんでした / Could not load conversation history';

export function createChatPanelMock(scenario: ChatPanelScenario = {}) {
  const lifetime = new AbortController();
  const streams = new Set<{ send: (events: ChatStreamEvent[]) => void; close: () => void }>();
  const history = structuredClone(scenario.history ?? courseHistory);
  let feedbackAttempts = 0;
  for (const request of [chatRequest, historyRequest, evaluationRequest, feedbackRequest, csvRequest]) request.mockClear();
  const handlers = [
    http.post('/api/chat/messages/stream', async ({ request }) => {
      const body = await request.json() as ChatRequest;
      chatRequest({ ...body, share_slug: new URL(request.url).searchParams.get('share_slug') ?? undefined });
      if (scenario.httpError) return HttpResponse.json({ error: { code: 'STREAM_FAILED', message: 'Connection failed (fixture)' } }, { status: 503 });
      const encoder = new TextEncoder();
      let cleanup = () => {};
      const bodyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const connection = {
            send(events: ChatStreamEvent[]) {
              if (!closed) for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            },
            close() {
              if (closed) return;
              cleanup();
              controller.close();
            },
          };
          cleanup = () => {
            closed = true;
            streams.delete(connection);
            lifetime.signal.removeEventListener('abort', connection.close);
            request.signal.removeEventListener('abort', connection.close);
          };
          streams.add(connection);
          lifetime.signal.addEventListener('abort', connection.close, { once: true });
          request.signal.addEventListener('abort', connection.close, { once: true });
          if (lifetime.signal.aborted || request.signal.aborted) { connection.close(); return; }
          connection.send(scenario.events ?? answerEvents());
          if (!scenario.keepOpen) connection.close();
        },
        cancel() { cleanup(); },
      });
      return new HttpResponse(bodyStream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }),
    trpcHandler([
      trpcQuery('chat.history', input => {
        historyRequest(input);
        if (scenario.historyState === 'pending') return pending();
        if (scenario.historyState === 'error') return failure(historyError);
        return success({ data: history, meta: { total: history.length, limit: input.limit ?? 100, offset: input.offset ?? 0 } });
      }),
      trpcQuery('evaluation.logs', input => {
        evaluationRequest(input);
        const data = scenario.evaluations ?? [completedEvaluation];
        return success({ data, meta: { total: data.length, limit: input.limit ?? 200, offset: input.offset ?? 0 } });
      }),
      trpcMutation('chat.feedback', input => {
        feedbackRequest(input);
        feedbackAttempts++;
        if (scenario.feedback === 'pending') return pending();
        if (scenario.feedback === 'error' || (scenario.feedback === 'retry' && feedbackAttempts === 1)) return failure('Feedback failed (fixture)');
        const item = history.find(item => item.id === input.chatLogId);
        if (item) item.feedback = input.feedback;
        return success({ chat_log_id: input.chatLogId, feedback: input.feedback });
      }),
    ]),
    http.get('/api/chat/courses/:courseId/history.csv', async ({ params }) => {
      csvRequest({ courseId: Number(params.courseId) });
      if (scenario.csv === 'pending' && !lifetime.signal.aborted) await new Promise<void>(resolve => lifetime.signal.addEventListener('abort', () => resolve(), { once: true }));
      if (scenario.csv === 'error' || lifetime.signal.aborted) return new HttpResponse('Export failed (fixture)', { status: 503 });
      return new HttpResponse('question,answer\n"Storybook question","Storybook answer"\n', { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="storybook-chat.csv"' } });
    }),
  ];
  return {
    handlers,
    emit: (events: ChatStreamEvent[]) => { for (const stream of streams) stream.send(events); },
    finish: () => { for (const stream of streams) stream.close(); },
    dispose: () => lifetime.abort(),
    get activeStreams() { return streams.size; },
  };
}
