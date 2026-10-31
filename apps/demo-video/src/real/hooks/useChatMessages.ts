import { useLayoutEffect, useRef } from 'react';
import { useFilm } from '../film';

export type { Message } from '@/hooks/useChatMessages';

export function useChatMessages(_options: { courseId?: number; shareToken?: string }) {
  const { chat } = useFilm();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // The real hook follows a growing answer the same way.
  useLayoutEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  });
  return {
    ...chat,
    setInput: () => {},
    feedbackUpdatingIds: new Set<number>(),
    messagesContainerRef,
    handleMessagesScroll: () => {},
    handleSend: async () => {},
    handleKeyPress: () => {},
    handleFeedback: async () => {},
  };
}
