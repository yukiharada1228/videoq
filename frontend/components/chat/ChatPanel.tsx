import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, RelatedVideo, ChatHistoryItem } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
  chatLogId?: number;
  feedback?: 'good' | 'bad' | null;
}

interface ChatPanelProps {
  hasApiKey: boolean;
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
  className?: string;
}

export function ChatPanel({ hasApiKey, groupId, onVideoPlay, shareToken, className }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'こんにちは！動画に関する質問にお答えします。何か質問はありますか？',
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
    if (!groupId || !!shareToken) return; // 共有リンクでは無効
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

  // 動画ページに遷移する関数
  const navigateToVideo = (videoId: number, startTime: string) => {
    if (onVideoPlay) {
      // グループ画面内で動画を再生
      onVideoPlay(videoId, startTime);
    } else {
      // 新しいタブで動画ページを開く
      const seconds = timeStringToSeconds(startTime);
      window.open(`/videos/${videoId}?t=${seconds}`, '_blank');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !hasApiKey) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await apiClient.chat({
        // バックエンドは最新のユーザメッセージのみを参照するため最小限で送信
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
          content: 'エラーが発生しました。APIキーが正しく設定されているか確認してください。',
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ChatHeader = () => (
    <CardHeader className="flex items-center justify-between">
      <CardTitle>チャット</CardTitle>
      {groupId && !shareToken && (
        <Button variant="outline" onClick={openHistory}>会話履歴</Button>
      )}
    </CardHeader>
  );

  const cardClassName = cn('flex flex-col', className ?? 'h-[500px] lg:h-[600px]');

  if (!hasApiKey) {
    return (
      <Card className={cardClassName}>
        <ChatHeader />
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <p className="mb-2">APIキーが設定されていません</p>
            <p className="text-sm">設定ページでAPIキーを設定してください</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={cardClassName}>
        <ChatHeader />
        <CardContent className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.related_videos && message.related_videos.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <p className="text-xs text-gray-600 mb-2">関連動画:</p>
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
                        Good
                      </Button>
                      <Button
                        size="sm"
                        variant={message.feedback === 'bad' ? 'default' : 'outline'}
                        disabled={feedbackUpdatingId === message.chatLogId}
                        onClick={() => handleFeedback(message.chatLogId!, 'bad')}
                      >
                        Bad
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
              onKeyPress={handleKeyPress}
              placeholder="メッセージを入力..."
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              {loading ? '送信中...' : '送信'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {historyOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-2xl max-h-[80vh] rounded shadow-lg overflow-hidden flex flex-col">
            <div className="p-3 lg:p-4 border-b flex items-center justify-between">
              <div className="font-semibold text-sm lg:text-base">会話履歴</div>
              <div className="flex items-center gap-2">
                {!historyLoading && (history?.length ?? 0) > 0 && (
                  <Button variant="outline" size="sm" onClick={exportHistoryCsv}>
                    <span className="hidden lg:inline">CSVエクスポート</span>
                    <span className="lg:hidden">CSV</span>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>閉じる</Button>
              </div>
            </div>
            <div className="p-4 overflow-auto">
              {historyLoading && <div className="text-sm text-gray-500">読込中...</div>}
              {!historyLoading && (history?.length ?? 0) === 0 && (
                <div className="text-sm text-gray-500">履歴はありません</div>
              )}
              {!historyLoading && (history?.length ?? 0) > 0 && (
                <div className="space-y-4">
                  {history!.map((item) => (
                    <div key={item.id} className="border rounded p-3">
                      <div className="text-xs text-gray-500 mb-2">{new Date(item.created_at).toLocaleString()}</div>
                      <div className="mb-2">
                        <div className="text-xs text-gray-600 mb-1">質問</div>
                        <div className="whitespace-pre-wrap">{item.question}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">回答</div>
                        <div className="whitespace-pre-wrap">{item.answer}</div>
                      </div>
                      {item.related_videos?.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <div className="text-xs text-gray-600 mb-1">関連動画</div>
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
                        <div className="mt-2 text-[10px] text-purple-600">共有リンク経由</div>
                      )}
                      <div className="mt-2 text-xs text-gray-600">
                        フィードバック:{' '}
                        {item.feedback === 'good'
                          ? 'Good'
                          : item.feedback === 'bad'
                          ? 'Bad'
                          : '未評価'}
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
