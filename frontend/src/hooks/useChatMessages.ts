import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, ApiError, type Citation } from '@/lib/api';
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

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  chatLogId?: number;
  feedback?: ChatFeedbackValue;
}

interface UseChatMessagesOptions {
  groupId?: number;
  shareToken?: string;
  mode?: 'qa' | 'study';
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
  handleFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<ChatFeedbackValue | undefined>;
}

/** Browser-tab study session key (paper: dialogue-session state, not durable DB). */
function getOrCreateStudySessionId(scope: string): string | undefined {
  if (!scope || typeof window === 'undefined' || !window.sessionStorage) {
    return undefined;
  }
  const key = `plog-study-session:${scope}`;
  try {
    let id = window.sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export function useChatMessages({ groupId, shareToken, mode = 'qa' }: UseChatMessagesOptions): UseChatMessagesReturn {
  const { t } = useTranslation();
  const tRef = useRef(t);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', content: t('chat.assistantGreeting') },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const appendAssistantContent = useCallback((text: string) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ role: 'assistant', content: text }];
      }

      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = { ...last, content: last.content + text };
      return updated;
    });
  }, []);

  const applyDoneMetadata = useCallback((event: ChatStreamDoneEvent) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return prev;
      }

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

  const replaceLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ role: 'assistant', content }];
      }

      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content };
      return updated;
    });
  }, []);

  const handleStreamError = useCallback((event: ChatStreamErrorEvent) => {
    const errorMessage =
      event.code === 'OVER_QUOTA'
        ? tRef.current('chat.errorOverQuota')
        : event.code === 'PLOG_NOT_READY'
          ? tRef.current('chat.errorPlogNotReady')
          : tRef.current('chat.error');
    replaceLastAssistantMessage(errorMessage);
  }, [replaceLastAssistantMessage]);

  const streamController = useMemo(
    () =>
      new ChatStreamController({
        flush: flushSync,
        onAppendContent: appendAssistantContent,
        onDone: applyDoneMetadata,
        onError: handleStreamError,
      }),
    [appendAssistantContent, applyDoneMetadata, handleStreamError],
  );

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      streamController.dispose();
    };
  }, [streamController]);

  const feedbackMutation = useMutation({
    mutationFn: async ({ chatLogId, nextFeedback }: { chatLogId: number; nextFeedback: ChatFeedbackValue }) =>
      await apiClient.setChatFeedback(chatLogId, nextFeedback, shareToken),
  });

  const handleSend = useCallback(async () => {
    if (!input.trim() || sendInFlightRef.current) return;

    const userMessage: Message = { role: 'user', content: input };
    const prior = messages[0]?.role === 'assistant' ? messages.slice(1) : messages;
    const historyForApi = [
      ...prior
        .filter((m) => m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ].slice(-12);

    sendInFlightRef.current = true;
    streamController.start();
    setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }]);
    setInput('');
    setIsLoading(true);

    try {
      for await (const event of apiClient.chatStream({
        messages: historyForApi,
        ...(groupId ? { group_id: groupId } : {}),
        ...(shareToken ? { share_slug: shareToken } : {}),
        ...(mode === 'study'
          ? {
              study_session_id: getOrCreateStudySessionId(
                shareToken ? `share:${shareToken}` : `group:${groupId ?? 'local'}`,
              ),
            }
          : {}),
        mode,
      })) {
        streamController.handleEvent(event);
        if (event.type === 'error') {
          return;
        }
      }
      await streamController.complete();
    } catch (error) {
      streamController.abort();
      console.error('Chat error:', error);
      const errorMessage =
        error instanceof ApiError && error.code === 'OVER_QUOTA'
          ? tRef.current('chat.errorOverQuota')
          : error instanceof ApiError && error.code === 'PLOG_NOT_READY'
            ? tRef.current('chat.errorPlogNotReady')
            : tRef.current('chat.error');
      replaceLastAssistantMessage(errorMessage);
    } finally {
      sendInFlightRef.current = false;
      setIsLoading(false);
    }
  }, [
    groupId,
    input,
    messages,
    mode,
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
    const targetMessage = messages.find((message) => message.chatLogId === chatLogId);
    if (!targetMessage) return undefined;

    const nextFeedback = getNextChatFeedback(targetMessage.feedback, value);

    setFeedbackUpdatingId(chatLogId);
    try {
      const result = await feedbackMutation.mutateAsync({ chatLogId, nextFeedback });
      const normalizedFeedback = result.feedback ?? null;

      setMessages((prev) => applyChatFeedback(prev, chatLogId, normalizedFeedback));
      return normalizedFeedback;
    } catch (error) {
      console.error('Failed to update feedback', error);
      return undefined;
    } finally {
      setFeedbackUpdatingId(null);
    }
  }, [messages, feedbackMutation]);

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
