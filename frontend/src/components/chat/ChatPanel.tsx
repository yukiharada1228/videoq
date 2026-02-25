import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, type ChatHistoryItem } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useChatMessages, type Message } from '@/hooks/useChatMessages';

interface ChatMessageBubbleProps {
  message: Message;
  feedbackUpdatingId: number | null;
  onVideoNavigate: (videoId: number, startTime: string) => void;
  onFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<void>;
}

function ChatMessageBubble({ message, feedbackUpdatingId, onVideoNavigate, onFeedback }: ChatMessageBubbleProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        {message.related_videos && message.related_videos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-300">
            <p className="text-xs text-gray-600 mb-2">{t('chat.relatedVideos')}:</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {message.related_videos.map((video, videoIndex) => (
                <div
                  key={videoIndex}
                  className="flex-shrink-0 bg-white border border-gray-200 rounded p-2 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onVideoNavigate(video.video_id, video.start_time)}
                >
                  <p className="text-xs font-medium text-gray-800 truncate mb-1">{video.title}</p>
                  <p className="text-xs text-gray-600">{video.start_time}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {message.role === 'assistant' && message.chatLogId && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant={message.feedback === 'good' ? 'default' : 'outline'}
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'good')}
            >
              {t('chat.feedbackGood')}
            </Button>
            <Button
              size="sm"
              variant={message.feedback === 'bad' ? 'default' : 'outline'}
              disabled={feedbackUpdatingId === message.chatLogId}
              onClick={() => onFeedback(message.chatLogId!, 'bad')}
            >
              {t('chat.feedbackBad')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
  className?: string;
}

interface ChatHistoryModalProps {
  groupId: number;
  shareToken?: string;
  history: ChatHistoryItem[] | null;
  historyLoading: boolean;
  onClose: () => void;
}

function ChatHistoryModal({ groupId, shareToken, history, historyLoading, onClose }: ChatHistoryModalProps) {
  const { t } = useTranslation();

  const exportHistoryCsv = async () => {
    if (!groupId || !!shareToken) return;
    try {
      await apiClient.exportChatHistoryCsv(groupId);
    } catch (e) {
      console.error('Failed to export CSV', e);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded shadow-lg overflow-hidden flex flex-col">
        <div className="p-3 lg:p-4 border-b flex items-center justify-between">
          <div className="font-semibold text-sm lg:text-base">{t('chat.history')}</div>
          <div className="flex items-center gap-2">
            {!historyLoading && (history?.length ?? 0) > 0 && (
              <Button variant="outline" size="sm" onClick={exportHistoryCsv}>
                <span className="hidden lg:inline">{t('chat.exportCsv')}</span>
                <span className="lg:hidden">{t('chat.exportCsvShort')}</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('chat.close')}
            </Button>
          </div>
        </div>
        <div className="p-4 overflow-auto">
          {historyLoading && <div className="text-sm text-gray-500">{t('chat.historyLoading')}</div>}
          {!historyLoading && (history?.length ?? 0) === 0 && (
            <div className="text-sm text-gray-500">{t('chat.historyEmpty')}</div>
          )}
          {!historyLoading && (history?.length ?? 0) > 0 && (
            <div className="space-y-4">
              {history!.map((item) => (
                <div key={item.id} className="border rounded p-3">
                  <div className="text-xs text-gray-500 mb-2">{new Date(item.created_at).toLocaleString()}</div>
                  <div className="mb-2">
                    <div className="text-xs text-gray-600 mb-1">{t('chat.question')}</div>
                    <div className="whitespace-pre-wrap">{item.question}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">{t('chat.answer')}</div>
                    <div className="whitespace-pre-wrap">{item.answer}</div>
                  </div>
                  {item.related_videos?.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs text-gray-600 mb-1">{t('chat.relatedVideos')}</div>
                      <div className="flex gap-2 overflow-x-auto">
                        {item.related_videos.map((v, idx) => (
                          <div key={idx} className="text-xs px-2 py-1 border rounded bg-gray-50">
                            {v.title} {v.start_time}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {item.is_shared_origin && (
                    <div className="mt-2 text-[10px] text-purple-600">{t('chat.sharedOrigin')}</div>
                  )}
                  <div className="mt-2 text-xs text-gray-600">
                    {t('chat.feedback')}{' '}
                    {item.feedback === 'good'
                      ? t('chat.feedbackGood')
                      : item.feedback === 'bad'
                        ? t('chat.feedbackBad')
                        : t('chat.feedbackNone')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPanel({ groupId, onVideoPlay, shareToken, className }: ChatPanelProps) {
  const { t } = useTranslation();
  const {
    messages,
    input,
    setInput,
    loading,
    feedbackUpdatingId,
    messagesContainerRef,
    messagesEndRef,
    handleSend,
    handleKeyPress,
    handleFeedback,
  } = useChatMessages({ groupId, shareToken });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ChatHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const openHistory = async () => {
    if (!groupId || !!shareToken) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const data = await apiClient.getChatHistory(groupId);
      setHistory(data);
    } catch (e) {
      console.error('Failed to load history', e);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const navigateToVideo = (videoId: number, startTime: string) => {
    if (onVideoPlay) {
      onVideoPlay(videoId, startTime);
    } else {
      const seconds = timeStringToSeconds(startTime);
      window.open(`/videos/${videoId}?t=${seconds}`, '_blank');
    }
  };

  const handleFeedbackWithSync = async (chatLogId: number, value: 'good' | 'bad') => {
    await handleFeedback(chatLogId, value);
    // Sync feedback to history modal if open
    const targetMessage = messages.find((m) => m.chatLogId === chatLogId);
    if (targetMessage) {
      setHistory((prev) =>
        prev
          ? prev.map((item) =>
            item.id === chatLogId ? { ...item, feedback: targetMessage.feedback === value ? null : value } : item,
          )
          : prev,
      );
    }
  };

  const cardClassName = cn('flex flex-col', className ?? 'h-[500px] lg:h-[600px]');

  return (
    <>
      <Card className={cardClassName}>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>{t('chat.title')}</CardTitle>
          {groupId && !shareToken && (
            <Button variant="outline" onClick={openHistory}>
              {t('chat.history')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message: Message, index: number) => (
              <ChatMessageBubble
                key={index}
                message={message}
                feedbackUpdatingId={feedbackUpdatingId}
                onVideoNavigate={navigateToVideo}
                onFeedback={handleFeedbackWithSync}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t('chat.placeholder') as string}
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              {loading ? t('common.actions.sending') : t('common.actions.send')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {historyOpen && (
        <ChatHistoryModal
          groupId={groupId!}
          shareToken={shareToken}
          history={history}
          historyLoading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}
