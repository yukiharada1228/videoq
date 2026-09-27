import type { ChatStreamEvent } from '@/lib/api';
import { appendChatPart, serializeChatParts, type ChatContentPart } from '@videoq/trpc/chat';

export const CHAT_STREAM_RENDER_TICK_MS = 24;
export const CHAT_STREAM_RENDER_CHARS_PER_TICK = 3;

export type ChatStreamDoneEvent = Extract<ChatStreamEvent, { type: 'done' }>;
export type ChatStreamErrorEvent = Extract<ChatStreamEvent, { type: 'error' }>;

export interface ChatStreamState {
  queuedContent: string;
  queuedParts: ChatContentPart[];
  doneEvent: ChatStreamDoneEvent | null;
  streamFinished: boolean;
}

export type ChatStreamAction =
  | { type: 'stream_started' }
  | { type: 'stream_event'; event: ChatStreamEvent }
  | { type: 'stream_finished' }
  | { type: 'content_drained'; charCount: number }
  | { type: 'parts_drained'; remaining: ChatContentPart[] }
  | { type: 'done_applied' }
  | { type: 'stream_aborted' };

type TimerId = ReturnType<typeof setInterval>;

interface ChatStreamControllerOptions {
  charsPerTick?: number;
  tickMs?: number;
  flush?: (callback: () => void) => void;
  onAppendContent: (text: string) => void;
  onAppendParts?: (parts: ChatContentPart[]) => void;
  onDone: (event: ChatStreamDoneEvent) => void;
  onError: (event: ChatStreamErrorEvent) => void;
}

export function createInitialChatStreamState(): ChatStreamState {
  return {
    queuedContent: '',
    queuedParts: [],
    doneEvent: null,
    streamFinished: false,
  };
}

export function chatStreamReducer(
  state: ChatStreamState,
  action: ChatStreamAction,
): ChatStreamState {
  switch (action.type) {
    case 'stream_started':
      return createInitialChatStreamState();
    case 'stream_event':
      if (state.streamFinished && action.event.type !== 'error') return state;
      if (action.event.type === 'text_delta' || action.event.type === 'citation') {
        const queuedParts = state.queuedParts.map((part) => ({ ...part }));
        appendChatPart(queuedParts, action.event.type === 'text_delta'
          ? { type: 'text', text: action.event.text }
          : { type: 'citation', sourceId: action.event.sourceId });
        return { ...state, queuedParts };
      }
      if (action.event.type === 'content_chunk') {
        return {
          ...state,
          queuedContent: state.queuedContent + action.event.text,
        };
      }
      if (action.event.type === 'done') {
        return {
          ...state,
          doneEvent: action.event,
          streamFinished: true,
        };
      }
      if (action.event.type === 'error') {
        return {
          ...state,
          queuedContent: '',
          queuedParts: [],
          doneEvent: null,
          streamFinished: true,
        };
      }
      // 検索の進行状況は useChatMessages 側で扱う。本文の描画キューは変更しない。
      // 未知のイベント種別をエラー扱いにすると、API が先にデプロイされた時に
      // 正常な応答がエラー表示になる。
      return state;
    case 'stream_finished':
      return {
        ...state,
        streamFinished: true,
      };
    case 'content_drained':
      return {
        ...state,
        queuedContent: state.queuedContent.slice(action.charCount),
      };
    case 'parts_drained':
      return { ...state, queuedParts: action.remaining };
    case 'done_applied':
      return {
        ...state,
        doneEvent: null,
      };
    case 'stream_aborted':
      return {
        ...createInitialChatStreamState(),
        streamFinished: true,
      };
    default:
      return state;
  }
}

export class ChatStreamController {
  private state = createInitialChatStreamState();
  private drainTimer: TimerId | null = null;
  private readonly charsPerTick: number;
  private readonly tickMs: number;
  private readonly flush: (callback: () => void) => void;
  private readonly onAppendContent: (text: string) => void;
  private readonly onAppendParts: (parts: ChatContentPart[]) => void;
  private readonly onDone: (event: ChatStreamDoneEvent) => void;
  private readonly onError: (event: ChatStreamErrorEvent) => void;
  private waiters: Array<() => void> = [];

  constructor({
    charsPerTick = CHAT_STREAM_RENDER_CHARS_PER_TICK,
    tickMs = CHAT_STREAM_RENDER_TICK_MS,
    flush = (callback) => callback(),
    onAppendContent,
    onAppendParts,
    onDone,
    onError,
  }: ChatStreamControllerOptions) {
    this.charsPerTick = charsPerTick;
    this.tickMs = tickMs;
    this.flush = flush;
    this.onAppendContent = onAppendContent;
    this.onAppendParts = onAppendParts ?? ((parts) => onAppendContent(serializeChatParts(parts)));
    this.onDone = onDone;
    this.onError = onError;
  }

  start() {
    this.stopDrainTimer();
    this.flushDrainWaiters();
    this.state = chatStreamReducer(this.state, { type: 'stream_started' });
  }

  handleEvent(event: ChatStreamEvent) {
    if (this.state.streamFinished) return;
    this.state = chatStreamReducer(this.state, { type: 'stream_event', event });

    if (event.type === 'content_chunk' || event.type === 'text_delta' || event.type === 'citation') {
      if (event.type === 'citation' || event.text !== '') {
        this.ensureDrainTimer();
      }
      return;
    }

    if (event.type === 'done') {
      this.tryFinalizeDrain();
      return;
    }

    if (event.type !== 'error') return; // searching など進行状況のみのイベント

    this.stopDrainTimer();
    this.flushDrainWaiters();
    this.onError(event);
  }

  async complete() {
    this.state = chatStreamReducer(this.state, { type: 'stream_finished' });
    await this.waitForDrainCompletion();
  }

  async waitForDrainCompletion() {
    if (this.canFinalize()) {
      this.tryFinalizeDrain();
      return;
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  abort() {
    this.stopDrainTimer();
    this.state = chatStreamReducer(this.state, { type: 'stream_aborted' });
    this.flushDrainWaiters();
  }

  dispose() {
    this.abort();
    this.state = createInitialChatStreamState();
  }

  getSnapshot() {
    return {
      ...this.state,
      timerActive: this.drainTimer !== null,
    };
  }

  private drainNextSlice() {
    if (this.state.queuedParts.length > 0) {
      const remaining = this.state.queuedParts.slice();
      const ready: ChatContentPart[] = [];
      let budget = this.charsPerTick;
      while (remaining.length > 0) {
        const part = remaining[0];
        if (part.type === 'citation') {
          ready.push(part);
          remaining.shift();
        } else {
          if (budget <= 0) break;
          const text = part.text.slice(0, budget);
          ready.push({ type: 'text', text });
          budget -= text.length;
          if (text.length === part.text.length) remaining.shift();
          else remaining[0] = { type: 'text', text: part.text.slice(text.length) };
        }
      }
      this.state = chatStreamReducer(this.state, { type: 'parts_drained', remaining });
      this.flush(() => this.onAppendParts(ready));
      this.tryFinalizeDrain();
      return;
    }
    if (this.state.queuedContent === '') {
      this.tryFinalizeDrain();
      return;
    }

    let charCount = this.charsPerTick;
    const partialRef = /\[\d*$/.exec(this.state.queuedContent.slice(0, charCount));
    if (partialRef) {
      const remainder = this.state.queuedContent.slice(partialRef.index);
      const completeRef = /^\[\d+\]/.exec(remainder);
      if (completeRef) {
        // [N] は一度に描画し、時刻になる前の「[」「[1」を表示しない。
        charCount = partialRef.index + completeRef[0].length;
      } else if (!this.state.streamFinished && /^\[\d*$/.test(remainder)) {
        charCount = partialRef.index;
      }
    }
    if (charCount === 0) return;

    const nextText = this.state.queuedContent.slice(0, charCount);
    this.state = chatStreamReducer(this.state, {
      type: 'content_drained',
      charCount,
    });

    this.flush(() => {
      this.onAppendContent(nextText);
    });
    this.tryFinalizeDrain();
  }

  private ensureDrainTimer() {
    if (this.drainTimer !== null) {
      return;
    }

    this.drainTimer = setInterval(() => {
      this.drainNextSlice();
    }, this.tickMs);
  }

  private tryFinalizeDrain() {
    if (this.state.queuedContent !== '' || this.state.queuedParts.length > 0) {
      return;
    }

    this.stopDrainTimer();

    if (!this.state.streamFinished) {
      return;
    }

    const doneEvent = this.state.doneEvent;
    if (doneEvent) {
      this.state = chatStreamReducer(this.state, { type: 'done_applied' });
      this.onDone(doneEvent);
    }

    this.flushDrainWaiters();
  }

  private canFinalize() {
    return this.state.queuedContent === '' && this.state.queuedParts.length === 0 && this.state.streamFinished;
  }

  private stopDrainTimer() {
    if (this.drainTimer === null) {
      return;
    }

    clearInterval(this.drainTimer);
    this.drainTimer = null;
  }

  private flushDrainWaiters() {
    const waiters = this.waiters.splice(0);
    waiters.forEach((resolve) => resolve());
  }
}
