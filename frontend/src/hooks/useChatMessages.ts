import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, type RelatedVideo } from '@/lib/api';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
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
  loading: boolean;
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
  const [loading, setLoading] = useState(false);
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (userMessage: Message) => {
      return await apiClient.chat({
        messages: [userMessage],
        ...(groupId ? { group_id: groupId } : {}),
        ...(shareToken ? { share_token: shareToken } : {}),
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async ({ chatLogId, nextFeedback }: { chatLogId: number; nextFeedback: 'good' | 'bad' | null }) =>
      await apiClient.setChatFeedback(chatLogId, nextFeedback, shareToken),
  });

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await chatMutation.mutateAsync(userMessage);

      setMessages((prev) => [
        ...prev,
        {
          role: response.role,
          content: response.content,
          related_videos: response.related_videos,
          chatLogId: response.chat_log_id,
          feedback: response.feedback ?? null,
        },
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: t('chat.error') },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, chatMutation, t]);

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
  }, [messages, shareToken, feedbackMutation]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    loading,
    feedbackUpdatingId,
    messagesEndRef,
    messagesContainerRef,
    handleSend,
    handleKeyPress,
    handleFeedback,
  };
}
