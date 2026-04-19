import { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, ApiError, type Citation } from '@/lib/api';

const STREAM_RENDER_TICK_MS = 24;
const STREAM_RENDER_CHARS_PER_TICK = 3;

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  chatLogId?: number;
  feedback?: 'good' | 'bad' | null;
}

interface UseChatMessagesOptions {
  groupId?: number;
  shareToken?: string;
}

interface UseChatMessagesReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: (input: string) => void;
  isLoading: boolean;
  feedbackUpdatingId: number | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  handleSend: () => Promise<void>;
  handleKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<void>;
}

export function useChatMessages({ groupId, shareToken }: UseChatMessagesOptions): UseChatMessagesReturn {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', content: t('chat.assistantGreeting') },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pendingContentRef = useRef('');
  const pendingDoneEventRef = useRef<Extract<Awaited<ReturnType<typeof apiClient.chatStream>> extends AsyncGenerator<infer T> ? T : never, { type: 'done' }> | null>(null);
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamFinishedRef = useRef(false);
  const drainWaitersRef = useRef<Array<() => void>>([]);

  const stopDrainTimer = useCallback(() => {
    if (drainTimerRef.current !== null) {
      clearInterval(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);

  const applyDoneMetadata = useCallback((event: NonNullable<typeof pendingDoneEventRef.current>) => {
    setMessages((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = {
        ...updated[updated.length - 1],
        citations: event.citations,
        chatLogId: event.chat_log_id ?? undefined,
        feedback: event.feedback ?? null,
      };
      return updated;
    });
  }, []);

  const flushDrainWaiters = useCallback(() => {
    const waiters = drainWaitersRef.current.splice(0);
    waiters.forEach((resolve) => resolve());
  }, []);

  const tryFinalizeDrain = useCallback(() => {
    if (pendingContentRef.current !== '' || !streamFinishedRef.current) {
      return;
    }
    stopDrainTimer();
    if (pendingDoneEventRef.current) {
      applyDoneMetadata(pendingDoneEventRef.current);
      pendingDoneEventRef.current = null;
    }
    flushDrainWaiters();
  }, [applyDoneMetadata, flushDrainWaiters, stopDrainTimer]);

  const drainNextSlice = useCallback(() => {
    if (pendingContentRef.current === '') {
      tryFinalizeDrain();
      return;
    }

    const nextText = pendingContentRef.current.slice(0, STREAM_RENDER_CHARS_PER_TICK);
    pendingContentRef.current = pendingContentRef.current.slice(STREAM_RENDER_CHARS_PER_TICK);

    flushSync(() => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        updated[updated.length - 1] = { ...last, content: last.content + nextText };
        return updated;
      });
    });

    tryFinalizeDrain();
  }, [tryFinalizeDrain]);

  const ensureDrainTimer = useCallback(() => {
    if (drainTimerRef.current !== null) {
      return;
    }
    drainTimerRef.current = setInterval(() => {
      drainNextSlice();
    }, STREAM_RENDER_TICK_MS);
  }, [drainNextSlice]);

  const waitForDrainCompletion = useCallback(async () => {
    if (pendingContentRef.current === '' && streamFinishedRef.current) {
      tryFinalizeDrain();
      return;
    }
    await new Promise<void>((resolve) => {
      drainWaitersRef.current.push(resolve);
    });
  }, [tryFinalizeDrain]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const feedbackMutation = useMutation({
    mutationFn: async ({ chatLogId, nextFeedback }: { chatLogId: number; nextFeedback: 'good' | 'bad' | null }) =>
      await apiClient.setChatFeedback(chatLogId, nextFeedback, shareToken),
  });

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    pendingContentRef.current = '';
    pendingDoneEventRef.current = null;
    streamFinishedRef.current = false;
    stopDrainTimer();
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    try {
      for await (const event of apiClient.chatStream({
        messages: [userMessage],
        ...(groupId ? { group_id: groupId } : {}),
        ...(shareToken ? { share_slug: shareToken } : {}),
      })) {
        if (event.type === 'content_chunk') {
          pendingContentRef.current += event.text;
          ensureDrainTimer();
        } else if (event.type === 'done') {
          pendingDoneEventRef.current = event;
          streamFinishedRef.current = true;
          tryFinalizeDrain();
        } else if (event.type === 'error') {
          pendingContentRef.current = '';
          pendingDoneEventRef.current = null;
          streamFinishedRef.current = true;
          stopDrainTimer();
          flushDrainWaiters();
          const errorMessage =
            event.code === 'OVER_QUOTA'
              ? t('chat.errorOverQuota')
              : t('chat.error');
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: errorMessage };
            return updated;
          });
        }
      }
      streamFinishedRef.current = true;
      await waitForDrainCompletion();
    } catch (error) {
      pendingContentRef.current = '';
      pendingDoneEventRef.current = null;
      streamFinishedRef.current = true;
      stopDrainTimer();
      flushDrainWaiters();
      console.error('Chat error:', error);
      const errorMessage =
        error instanceof ApiError && error.code === 'OVER_QUOTA'
          ? t('chat.errorOverQuota')
          : t('chat.error');
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: errorMessage };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    applyDoneMetadata,
    ensureDrainTimer,
    flushDrainWaiters,
    groupId,
    input,
    isLoading,
    shareToken,
    stopDrainTimer,
    t,
    tryFinalizeDrain,
    waitForDrainCompletion,
  ]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Process') return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleFeedback = useCallback(async (chatLogId: number, value: 'good' | 'bad') => {
    const targetMessage = messages.find((message) => message.chatLogId === chatLogId);
    if (!targetMessage) return;

    const nextFeedback = targetMessage.feedback === value ? null : value;

    setFeedbackUpdatingId(chatLogId);
    try {
      const result = await feedbackMutation.mutateAsync({ chatLogId, nextFeedback });
      const normalizedFeedback = result.feedback ?? null;

      setMessages((prev) =>
        prev.map((message) =>
          message.chatLogId === chatLogId
            ? { ...message, feedback: normalizedFeedback }
            : message,
        ),
      );
    } catch (error) {
      console.error('Failed to update feedback', error);
    } finally {
      setFeedbackUpdatingId(null);
    }
  }, [messages, feedbackMutation]);

  useEffect(() => {
    return () => {
      stopDrainTimer();
    };
  }, [stopDrainTimer]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    feedbackUpdatingId,
    messagesEndRef,
    messagesContainerRef,
    handleSend,
    handleKeyPress,
    handleFeedback,
  };
}
