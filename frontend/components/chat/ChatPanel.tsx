import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiClient, RelatedVideo } from '@/lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
}

interface ChatPanelProps {
  hasApiKey: boolean;
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
}

export function ChatPanel({ hasApiKey, groupId, onVideoPlay, shareToken }: ChatPanelProps) {
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

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 時間文字列を秒に変換する関数（形式: HH:MM:SS,mmm または MM:SS）
  const timeToSeconds = (timeStr: string): number => {
    // カンマがあればミリ秒部分を削除
    const timeWithoutMs = timeStr.split(',')[0];
    const parts = timeWithoutMs.split(':');

    if (parts.length === 3) {
      // HH:MM:SS 形式
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseInt(parts[2], 10);
      return hours * 3600 + minutes * 60 + seconds;
    } else if (parts.length === 2) {
      // MM:SS 形式
      const minutes = parseInt(parts[0], 10);
      const seconds = parseInt(parts[1], 10);
      return minutes * 60 + seconds;
    }
    return 0;
  };

  // 動画ページに遷移する関数
  const navigateToVideo = (videoId: number, startTime: string) => {
    if (onVideoPlay) {
      // グループ画面内で動画を再生
      onVideoPlay(videoId, startTime);
    } else {
      // 新しいタブで動画ページを開く
      const seconds = timeToSeconds(startTime);
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
        messages: [...messages, userMessage],
        ...(groupId ? { group_id: groupId } : {}),
        ...(shareToken ? { share_token: shareToken } : {}),
      });

      setMessages((prev) => [...prev, response]);
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const ChatHeader = () => (
    <CardHeader>
      <CardTitle>チャット</CardTitle>
    </CardHeader>
  );

  if (!hasApiKey) {
    return (
      <Card className="h-[600px] flex flex-col">
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
    <Card className="h-[600px] flex flex-col">
      <ChatHeader />
      <CardContent className="flex-1 flex flex-col overflow-hidden">
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
  );
}

