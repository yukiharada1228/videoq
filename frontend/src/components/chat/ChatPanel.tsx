import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, type RelatedVideo, type ChatHistoryItem } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
  chatLogId?: number;
  feedback?: 'good' | 'bad' | null;
}

interface ChatPanelProps {
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
  className?: string;
}

export function ChatPanel({ groupId, onVideoPlay, shareToken, className }: ChatPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: 'assistant',
      content: t('chat.assistantGreeting'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ChatHistoryItem[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [feedbackUpdatingId, setFeedbackUpdatingId] = useState<number | null>(null);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const openHistory = async () => {
    if (!groupId || !!shareToken) return; // Disabled for share links
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

  const exportHistoryCsv = async () => {
    if (!groupId || !!shareToken) return;
    try {
      await apiClient.exportChatHistoryCsv(groupId);
    } catch (e) {
      console.error('Failed to export CSV', e);
    }
  };

  // Function to navigate to video page
  const navigateToVideo = (videoId: number, startTime: string) => {
    if (onVideoPlay) {
      // Play video within group screen
      onVideoPlay(videoId, startTime);
    } else {
      // Open video page in new tab
      const seconds = timeStringToSeconds(startTime);
      window.open(`/videos/${videoId}?t=${seconds}`, '_blank');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiClient.chat({
        // Send minimal data since backend only references latest user message
        messages: [userMessage],
        ...(groupId ? { group_id: groupId } : {}),
        ...(shareToken ? { share_token: shareToken } : {}),
      });

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
        {
          role: 'assistant',
          content: t('chat.error'),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (chatLogId: number, value: 'good' | 'bad') => {
    const targetMessage = messages.find((message) => message.chatLogId === chatLogId);
    if (!targetMessage) return;

    const nextFeedback = targetMessage.feedback === value ? null : value;

    setFeedbackUpdatingId(chatLogId);
    try {
      const result = await apiClient.setChatFeedback(chatLogId, nextFeedback, shareToken);
      const normalizedFeedback = result.feedback ?? null;

      setMessages((prev) =>
        prev.map((message) =>
          message.chatLogId === chatLogId
            ? { ...message, feedback: normalizedFeedback }
            : message,
        ),
      );

      setHistory((prev) =>
        prev
          ? prev.map((item) =>
            item.id === chatLogId ? { ...item, feedback: normalizedFeedback } : item,
          )
          : prev,
      );
    } catch (error) {
      console.error('Failed to update feedback', error);
    } finally {
      setFeedbackUpdatingId(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Process') {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ChatHeader = () => (
    <CardHeader className="flex items-center justify-between">
      <CardTitle>{t('chat.title')}</CardTitle>
      {groupId && !shareToken && (
        <Button variant="outline" onClick={openHistory}>
          {t('chat.history')}
        </Button>
      )}
    </CardHeader>
  );

  const cardClassName = cn('flex flex-col', className ?? 'h-[500px] lg:h-[600px]');

  return (
    <>
      <Card className={cardClassName}>
        <ChatHeader />
        <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
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
                            onClick={() => navigateToVideo(video.video_id, video.start_time)}
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
                        onClick={() => handleFeedback(message.chatLogId!, 'good')}
                      >
                        {t('chat.feedbackGood')}
                      </Button>
                      <Button
                        size="sm"
                        variant={message.feedback === 'bad' ? 'default' : 'outline'}
                        disabled={feedbackUpdatingId === message.chatLogId}
                        onClick={() => handleFeedback(message.chatLogId!, 'bad')}
                      >
                        {t('chat.feedbackBad')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
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
                <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>
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
      )}
    </>
  );
}
