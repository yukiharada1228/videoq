import { BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@/hooks/useChatMessages';
import { MessageBody } from '@/components/chat/MessageBody';

interface ChatMessageBubbleProps {
  message: Message;
  feedbackUpdatingId: number | null;
  onVideoNavigate: (videoId: number, startTime: string) => void;
  onFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<unknown>;
}

export function ChatMessageBubble({
  message,
  feedbackUpdatingId,
  onVideoNavigate,
  onFeedback,
}: ChatMessageBubbleProps) {
  const { t } = useTranslation();

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bg-[#006d30] text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm max-w-[90%] shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="bg-white border-l-4 border-[#00652c] rounded-2xl rounded-tl-none p-4 text-sm shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-[#00652c] font-bold text-xs mb-1">
          <BookOpen className="w-3.5 h-3.5" />
          AI {t('chat.teacher')}
        </div>
        <MessageBody
          content={message.content}
          citations={message.citations}
          onVideoNavigate={onVideoNavigate}
        />
        {message.chatLogId && (
          <div className="flex gap-2 pt-2">
            <button
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'good')}
              className={`p-1 hover:bg-stone-100 rounded transition-colors disabled:opacity-40 ${
                message.feedback === 'good' ? 'text-[#00652c]' : 'text-stone-400'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'bad')}
              className={`p-1 hover:bg-stone-100 rounded transition-colors disabled:opacity-40 ${
                message.feedback === 'bad' ? 'text-red-500' : 'text-stone-400'
              }`}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
