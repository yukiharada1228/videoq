import { BookOpen, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Message } from '@/hooks/useChatMessages';
import { MessageBody } from '@/components/chat/MessageBody';
import { Button } from '@/components/ui/button';

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
        <div className="max-w-[90%] border border-solid-gray-420 bg-solid-gray-50 px-4 py-3 text-std-16N-170 text-solid-gray-800">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="max-w-[90%] space-y-2 border border-solid-gray-420 border-l-4 border-l-key-900 bg-white p-4 text-std-16N-170">
        <div className="mb-1 flex items-center gap-2 text-dns-14B-120 font-bold text-key-900">
          <BookOpen className="h-3.5 w-3.5" />
          AI {t('chat.teacher')}
        </div>
        <MessageBody
          content={message.content}
          citations={message.citations}
          onVideoNavigate={onVideoNavigate}
        />
        {message.chatLogId && (
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="text"
              size="xs"
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'good')}
              className={`min-w-0 p-1 ${
                message.feedback === 'good' ? 'text-key-900' : 'text-solid-gray-420'
              }`}
              aria-label={t('chat.feedbackGood')}
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="text"
              size="xs"
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'bad')}
              className={`min-w-0 p-1 ${
                message.feedback === 'bad' ? 'text-error-1' : 'text-solid-gray-420'
              }`}
              aria-label={t('chat.feedbackBad')}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
