import type { RefObject } from 'react';
import type { Message } from '@/hooks/useChatMessages';
import { ChatMessageBubble } from '@/components/chat/ChatMessageBubble';

interface ChatMessagesViewProps {
  messages: Message[];
  isLoading: boolean;
  feedbackUpdatingId: number | null;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onVideoNavigate: (videoId: number, startTime: string) => void;
  onFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<unknown>;
}

export function ChatMessagesView({
  messages,
  isLoading,
  feedbackUpdatingId,
  messagesContainerRef,
  messagesEndRef,
  onVideoNavigate,
  onFeedback,
}: ChatMessagesViewProps) {
  return (
    <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <ChatMessageBubble
          key={index}
          message={message}
          // Only the trailing bubble can be the one the stream is filling in.
          isAwaitingResponse={isLoading && index === messages.length - 1}
          feedbackUpdatingId={feedbackUpdatingId}
          onVideoNavigate={onVideoNavigate}
          onFeedback={onFeedback}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
