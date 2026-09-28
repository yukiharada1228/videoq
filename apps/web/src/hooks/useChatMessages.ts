import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { applyChatPart, plainChatAnswer, chatAnswerText, type ChatAnswer, type ChatContentPart } from '@videoq/trpc/chat';
import { apiClient, ApiError } from '@/lib/api';
import { trpc } from '@/lib/trpc';
import { invalidateAfterChatAnswer, updateAfterChatFeedback } from '@/lib/cacheInvalidation';
import { createChatProgress, updateChatProgress, type ChatProgress } from '@/lib/chatProgress';
import {
  ChatStreamController,
  type ChatStreamDoneEvent,
  type ChatStreamErrorEvent,
} from '@/lib/chatStreamController';
import {
  applyChatFeedback,
  getNextChatFeedback,
  type ChatFeedbackValue,
} from '@/lib/chatFeedback';

export type Message = (
  | { role: 'user'; content: string }
  | { role: 'assistant'; answer: ChatAnswer }
) & {
  chatLogId?: number;
  feedback?: ChatFeedbackValue;
  progress?: ChatProgress;
};

interface UseChatMessagesOptions {
  courseId?: number;
  shareToken?: string;
}

interface UseChatMessagesReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  feedbackUpdatingIds: ReadonlySet<number>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  handleMessagesScroll: () => void;
  handleSend: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<void>;
}

export function useChatMessages({ courseId, shareToken }: UseChatMessagesOptions): UseChatMessagesReturn {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tRef = useRef(t);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', answer: plainChatAnswer(t('chat.assistantGreeting')) },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const feedbackInFlightRef = useRef(new Set<number>());
  const [feedbackUpdatingIds, setFeedbackUpdatingIds] = useState<ReadonlySet<number>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const followLatestRef = useRef(true);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const applyDoneMetadata = useCallback((event: ChatStreamDoneEvent) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        chatLogId: event.chat_log_id ?? undefined,
        feedback: event.feedback ?? null,
      };
      return updated;
    });
  }, []);

  const appendAssistantParts = useCallback((parts: ChatContentPart[]) => {
    setMessages((prev) => {
      const last = prev.at(-1);
      if (!last || last.role !== 'assistant') return prev;
      const answer = { ...last.answer, segments: [...last.answer.segments] };
      for (const part of parts) {
        const segment = answer.segments[part.segmentIndex];
        if (segment && segment === last.answer.segments[part.segmentIndex]) {
          answer.segments[part.segmentIndex] = { ...segment, sourceIds: [...segment.sourceIds] };
        }
        applyChatPart(answer, part);
      }
      return [...prev.slice(0, -1), { ...last, answer }];
    });
  }, []);

  const replaceLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ role: 'assistant', answer: plainChatAnswer(content) }];
      }

      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = {
        role: 'assistant', answer: plainChatAnswer(content),
        ...(last.progress ? { progress: updateChatProgress(last.progress, {
          type: 'error', code: 'STREAM_FAILED', message: '',
        }) } : {}),
      };
      return updated;
    });
  }, []);

  const handleStreamError = useCallback((event: ChatStreamErrorEvent) => {
    const errorMessage =
      event.code === 'OVER_QUOTA'
        ? tRef.current('chat.errorOverQuota')
        : import.meta.env.DEV && event.message?.trim()
          ? `${tRef.current('chat.error')} (${event.code}: ${event.message})`
          : tRef.current('chat.error');
    replaceLastAssistantMessage(errorMessage);
  }, [replaceLastAssistantMessage]);

  const streamController = useMemo(
    () =>
      new ChatStreamController({
        flush: flushSync,
        onAppendParts: appendAssistantParts,
        onDone: applyDoneMetadata,
        onError: handleStreamError,
      }),
    [appendAssistantParts, applyDoneMetadata, handleStreamError],
  );

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      followLatestRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 48;
    }
  }, []);

  // Follow growing answers before paint, but leave readers where they scrolled.
  // Tool status changes alone must not move the conversation.
  const lastMessage = messages.at(-1);
  const lastMessageText = lastMessage?.role === 'assistant' ? chatAnswerText(lastMessage.answer) : lastMessage?.content;
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && followLatestRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length, lastMessageText, lastMessage?.chatLogId, isLoading]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamController.dispose();
    };
  }, [streamController]);

  const feedbackMutation = useMutation(trpc.chat.feedback.mutationOptions());

  const handleSend = useCallback(async () => {
    if (!input.trim() || sendInFlightRef.current) return;

    const userMessage: Message = { role: 'user', content: input };
    // Each question is answered independently.
    const historyForApi = [userMessage];

    sendInFlightRef.current = true;
    const request = new AbortController();
    streamAbortRef.current = request;
    followLatestRef.current = true;
    streamController.start();
    setMessages((prev) => [...prev, userMessage, {
      role: 'assistant', answer: { segments: [], sources: [] }, progress: createChatProgress(),
    }]);
    setInput('');
    setIsLoading(true);

    try {
      for await (const event of apiClient.chatStream({
        messages: historyForApi,
        ...(courseId ? { course_id: courseId } : {}),
        ...(shareToken ? { share_slug: shareToken } : {}),
      }, request.signal)) {
        if (request.signal.aborted) return;
        setMessages((prev) => {
          const last = prev.at(-1);
          if (!last || last.role !== 'assistant') return prev;
          const progress = last.progress ? updateChatProgress(last.progress, event) : undefined;
          const sources = event.type === 'source' && !last.answer.sources.some(source => source.id === event.source.id)
            ? [...last.answer.sources, event.source] : last.answer.sources;
          if (progress === last.progress && sources === last.answer.sources) return prev;
          return [...prev.slice(0, -1), { ...last, progress, answer: { ...last.answer, sources } }];
        });
        streamController.handleEvent(event);
        if (event.type === 'error') {
          return;
        }
        if (event.type === 'done') {
          // Persistence is complete now, even while queued text is animating.
          // Shared answers use the owner's quota, not the visitor's account.
          if (!shareToken) void invalidateAfterChatAnswer(queryClient, courseId);
          break;
        }
      }
      await streamController.complete();
    } catch (error) {
      if (request.signal.aborted) return;
      streamController.abort();
      console.error('Chat error:', error);
      const errorMessage =
        error instanceof ApiError && error.code === 'OVER_QUOTA'
          ? tRef.current('chat.errorOverQuota')
          : tRef.current('chat.error');
      replaceLastAssistantMessage(errorMessage);
    } finally {
      if (streamAbortRef.current === request) {
        streamAbortRef.current = null;
        sendInFlightRef.current = false;
        if (!request.signal.aborted) setIsLoading(false);
      }
    }
  }, [
    courseId,
    input,
    queryClient,
    replaceLastAssistantMessage,
    shareToken,
    streamController,
  ]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Process') return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleFeedback = useCallback(async (chatLogId: number, value: 'good' | 'bad') => {
    if (feedbackInFlightRef.current.has(chatLogId)) return;
    const targetMessage = messages.find((message) => message.chatLogId === chatLogId);
    if (!targetMessage) return;

    const nextFeedback = getNextChatFeedback(targetMessage.feedback, value);

    feedbackInFlightRef.current.add(chatLogId);
    setFeedbackUpdatingIds(new Set(feedbackInFlightRef.current));
    try {
      const result = await feedbackMutation.mutateAsync({
        chatLogId,
        feedback: nextFeedback,
        shareSlug: shareToken,
      });
      setMessages((prev) => applyChatFeedback(prev, chatLogId, result.feedback));
      if (courseId && !shareToken) {
        await updateAfterChatFeedback(queryClient, courseId, result);
      }
    } catch (error) {
      console.error('Failed to update feedback', error);
    } finally {
      feedbackInFlightRef.current.delete(chatLogId);
      setFeedbackUpdatingIds(new Set(feedbackInFlightRef.current));
    }
  }, [courseId, feedbackMutation, messages, queryClient, shareToken]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    feedbackUpdatingIds,
    messagesContainerRef,
    handleMessagesScroll,
    handleSend,
    handleKeyPress,
    handleFeedback,
  };
}
