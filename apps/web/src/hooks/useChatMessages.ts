import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { RpcOutputMap } from '@videoq/trpc';
import { apiClient, ApiError, type Citation, type StudySessionInfo } from '@/lib/api';
import { TabStudySession } from '@/lib/studySession';
import { trpc } from '@/lib/trpc';
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

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  chatLogId?: number;
  feedback?: ChatFeedbackValue;
  /** Actual tool activity for this turn; kept locally with the answer. */
  progress?: ChatProgress;
}

interface UseChatMessagesOptions {
  courseId?: number;
  shareToken?: string;
  mode?: 'qa' | 'study';
}

interface UseChatMessagesReturn {
  studySession: StudySessionInfo | undefined;
  studyRestarted: boolean;
  studyStorageAvailable: boolean;
  restartStudy: () => boolean;
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

export function useChatMessages({ courseId, shareToken, mode = 'qa' }: UseChatMessagesOptions): UseChatMessagesReturn {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const tRef = useRef(t);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', content: t('chat.assistantGreeting') },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const feedbackInFlightRef = useRef(new Set<number>());
  const [feedbackUpdatingIds, setFeedbackUpdatingIds] = useState<ReadonlySet<number>>(new Set());
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const sendInFlightRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const followLatestRef = useRef(true);
  const scope = shareToken ? `share:${shareToken}` : `course:${courseId ?? 'local'}`;
  const session = useMemo(() => new TabStudySession(scope), [scope]);
  const [studyState, setStudyState] = useState<{
    session: TabStudySession;
    info?: StudySessionInfo;
    restarted?: boolean;
    persistent: boolean;
  }>({ session, persistent: true });
  const currentStudyState = studyState.session === session ? studyState : undefined;

  const restartStudy = useCallback(() => {
    if (sendInFlightRef.current) return false;
    session.restart();
    setStudyState({ session, restarted: true, persistent: session.persistent });
    setMessages([{ role: 'assistant', content: tRef.current('chat.studyGreeting') }]);
    setInput('');
    followLatestRef.current = true;
    return true;
  }, [session]);

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
    if (event.study_session) {
      setStudyState({ session, info: event.study_session, persistent: session.persistent });
    }
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
  }, [session]);

  const replaceLastAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ role: 'assistant', content }];
      }

      const updated = [...prev];
      const last = updated[updated.length - 1];
      updated[updated.length - 1] = {
        role: 'assistant', content,
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
        : event.code === 'PLOG_NOT_READY'
          ? tRef.current('chat.errorPlogNotReady')
          : import.meta.env.DEV && event.message?.trim()
            ? `${tRef.current('chat.error')} (${event.code}: ${event.message})`
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

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      followLatestRef.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 48;
    }
  }, []);

  // Follow growing answers before paint, but leave readers where they scrolled.
  // Tool status changes alone must not move the conversation.
  const lastMessage = messages.at(-1);
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container && followLatestRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages.length, lastMessage?.content, lastMessage?.chatLogId, isLoading]);

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
    // Q&A answers each question independently. Only Study needs the preceding
    // assistant question and bounded dialogue history for grading.
    const historyForApi: Pick<Message, 'role' | 'content'>[] = [userMessage];
    if (mode === 'study') {
      const first = messages[0]?.role === 'assistant' ? 1 : 0;
      for (let i = messages.length - 1; i >= first && historyForApi.length < 12; i--) {
        const { role, content } = messages[i];
        if (content.trim()) historyForApi.unshift({ role, content });
      }
    }

    sendInFlightRef.current = true;
    const request = new AbortController();
    streamAbortRef.current = request;
    followLatestRef.current = true;
    streamController.start();
    setMessages((prev) => [...prev, userMessage, {
      role: 'assistant', content: '', progress: createChatProgress(),
    }]);
    setInput('');
    setIsLoading(true);

    try {
      const studySessionId = mode === 'study' ? session.getId() : undefined;
      if (mode === 'study') {
        // Until a successful response arrives, a disconnect may have left the server ahead.
        setStudyState({ session, persistent: session.persistent });
      }
      for await (const event of apiClient.chatStream({
        messages: historyForApi,
        ...(courseId ? { course_id: courseId } : {}),
        ...(shareToken ? { share_slug: shareToken } : {}),
        ...(mode === 'study'
          ? {
              study_session_id: studySessionId,
            }
          : {}),
        mode,
      }, request.signal)) {
        if (request.signal.aborted) return;
        setMessages((prev) => {
          const last = prev.at(-1);
          if (!last?.progress) return prev;
          const progress = updateChatProgress(last.progress, event);
          if (progress === last.progress) return prev;
          return [...prev.slice(0, -1), { ...last, progress }];
        });
        streamController.handleEvent(event);
        if (event.type === 'error') {
          return;
        }
        if (event.type === 'done') break;
      }
      await streamController.complete();
    } catch (error) {
      if (request.signal.aborted) return;
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
      if (streamAbortRef.current === request) {
        streamAbortRef.current = null;
        sendInFlightRef.current = false;
        if (!request.signal.aborted) setIsLoading(false);
      }
    }
  }, [
    courseId,
    input,
    messages,
    mode,
    replaceLastAssistantMessage,
    shareToken,
    session,
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
        const filter = trpc.chat.history.queryFilter({ courseId });
        // A read started before the save must not overwrite the saved feedback.
        await queryClient.cancelQueries(filter);
        queryClient.setQueriesData<RpcOutputMap['chat.history']>(filter, (prev) => prev ? {
          ...prev,
          data: prev.data.map((item) => item.id === chatLogId ? { ...item, feedback: result.feedback } : item),
        } : prev);
        // A cancelled first load has no data to patch; resume only those queries.
        void queryClient.invalidateQueries({ ...filter, predicate: (query) => query.state.data === undefined });
      }
    } catch (error) {
      console.error('Failed to update feedback', error);
    } finally {
      feedbackInFlightRef.current.delete(chatLogId);
      setFeedbackUpdatingIds(new Set(feedbackInFlightRef.current));
    }
  }, [courseId, feedbackMutation, messages, queryClient, shareToken]);

  return {
    studySession: currentStudyState?.info,
    studyRestarted: currentStudyState?.restarted ?? false,
    studyStorageAvailable: currentStudyState?.persistent ?? true,
    restartStudy,
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
