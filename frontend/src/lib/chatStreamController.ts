import type { ChatStreamEvent } from '@/lib/api';

export const CHAT_STREAM_RENDER_TICK_MS = 24;
export const CHAT_STREAM_RENDER_CHARS_PER_TICK = 3;

export type ChatStreamDoneEvent = Extract<ChatStreamEvent, { type: 'done' }>;
export type ChatStreamErrorEvent = Extract<ChatStreamEvent, { type: 'error' }>;

export interface ChatStreamState {
  queuedContent: string;
  doneEvent: ChatStreamDoneEvent | null;
  errorEvent: ChatStreamErrorEvent | null;
  streamFinished: boolean;
}

export type ChatStreamAction =
  | { type: 'stream_started' }
  | { type: 'stream_event'; event: ChatStreamEvent }
  | { type: 'stream_finished' }
  | { type: 'content_drained'; charCount: number }
  | { type: 'done_applied' }
  | { type: 'stream_aborted' };

type TimerId = ReturnType<typeof setInterval>;

interface ChatStreamControllerOptions {
  charsPerTick?: number;
  tickMs?: number;
  flush?: (callback: () => void) => void;
  onAppendContent: (text: string) => void;
  onDone: (event: ChatStreamDoneEvent) => void;
  onError: (event: ChatStreamErrorEvent) => void;
}

export function createInitialChatStreamState(): ChatStreamState {
  return {
    queuedContent: '',
    doneEvent: null,
    errorEvent: null,
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
          errorEvent: null,
          streamFinished: true,
        };
      }
      return {
        ...state,
        queuedContent: '',
        doneEvent: null,
        errorEvent: action.event,
        streamFinished: true,
      };
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
  private readonly onDone: (event: ChatStreamDoneEvent) => void;
  private readonly onError: (event: ChatStreamErrorEvent) => void;
  private waiters: Array<() => void> = [];

  constructor({
    charsPerTick = CHAT_STREAM_RENDER_CHARS_PER_TICK,
    tickMs = CHAT_STREAM_RENDER_TICK_MS,
    flush = (callback) => callback(),
    onAppendContent,
    onDone,
    onError,
  }: ChatStreamControllerOptions) {
    this.charsPerTick = charsPerTick;
    this.tickMs = tickMs;
    this.flush = flush;
    this.onAppendContent = onAppendContent;
    this.onDone = onDone;
    this.onError = onError;
  }

  start() {
    this.stopDrainTimer();
    this.flushDrainWaiters();
    this.state = chatStreamReducer(this.state, { type: 'stream_started' });
  }

  handleEvent(event: ChatStreamEvent) {
    this.state = chatStreamReducer(this.state, { type: 'stream_event', event });

    if (event.type === 'content_chunk') {
      if (event.text !== '') {
        this.ensureDrainTimer();
      }
      return;
    }

    if (event.type === 'done') {
      this.tryFinalizeDrain();
      return;
    }

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
    if (this.state.queuedContent === '') {
      this.tryFinalizeDrain();
      return;
    }

    const nextText = this.state.queuedContent.slice(0, this.charsPerTick);
    this.state = chatStreamReducer(this.state, {
      type: 'content_drained',
      charCount: this.charsPerTick,
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
    if (this.state.queuedContent !== '') {
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
    return this.state.queuedContent === '' && this.state.streamFinished;
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
