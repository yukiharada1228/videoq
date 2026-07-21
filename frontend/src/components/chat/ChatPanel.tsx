import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChatHistory } from '@/hooks/useChatHistory';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatHistoryView } from '@/components/chat/ChatHistoryView';
import { ChatMessagesView } from '@/components/chat/ChatMessagesView';
import { Heading, HeadingTitle } from '@/components/ui/heading';

interface ChatPanelProps {
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
  className?: string;
}

type PanelTab = 'chat' | 'history';
type ChatMode = 'qa' | 'study';

export function ChatPanel({ groupId, onVideoPlay, shareToken, className }: ChatPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PanelTab>('chat');
  const [mode, setMode] = useState<ChatMode>('qa');

  const {
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    feedbackUpdatingId,
    messagesContainerRef,
    messagesEndRef,
    handleSend,
    handleKeyPress,
    handleFeedback,
  } = useChatMessages({ groupId, shareToken, mode });

  const {
    history,
    historyLoading,
    exportHistoryCsv,
    isExportingHistoryCsv,
    syncFeedbackInHistoryCache,
  } = useChatHistory({
    groupId,
    shareToken,
    enabled: tab === 'history',
  });

  const navigateToVideo = (videoId: number, startTime: string) => {
    if (onVideoPlay) {
      onVideoPlay(videoId, startTime);
      return;
    }

    const seconds = timeStringToSeconds(startTime);
    window.open(`/videos/${videoId}?t=${seconds}`, '_blank');
  };

  const handleFeedbackWithSync = async (chatLogId: number, value: 'good' | 'bad') => {
    const nextFeedback = await handleFeedback(chatLogId, value);
    if (nextFeedback !== undefined) {
      syncFeedbackInHistoryCache(chatLogId, nextFeedback);
    }
  };

  const switchMode = (next: ChatMode) => {
    if (next === mode) return;
    setMode(next);
    setMessages([
      {
        role: 'assistant',
        content:
          next === 'study' ? t('chat.studyGreeting') : t('chat.assistantGreeting'),
      },
    ]);
  };

  const showTabs = !!groupId && !shareToken;

  const containerClass = cn(
    'flex flex-col overflow-hidden border border-solid-gray-420 bg-white',
    className ?? 'h-[500px] lg:h-[600px]',
  );

  return (
    <div className={containerClass}>
      <div className="px-4 py-3 border-b border-solid-gray-200 shrink-0 flex items-center justify-between gap-4">
        <Heading size="18" className="shrink-0">
          <HeadingTitle level="h2">{t('chat.title')}</HeadingTitle>
        </Heading>
        {showTabs && (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setTab('chat')}
              className={`text-dns-14B-120 pb-1 transition-colors ${
                tab === 'chat'
                  ? 'text-key-900 border-b-2 border-key-900'
                  : 'text-solid-gray-420 hover:text-solid-gray-700'
              }`}
            >
              {t('chat.newConsultation')}
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`text-dns-14B-120 pb-1 transition-colors ${
                tab === 'history'
                  ? 'text-key-900 border-b-2 border-key-900'
                  : 'text-solid-gray-420 hover:text-solid-gray-700'
              }`}
            >
              {t('chat.history')}
            </button>
          </div>
        )}
      </div>

      {tab === 'chat' && groupId && (
        <div className="px-4 py-2 border-b border-solid-gray-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => switchMode('qa')}
            className={`text-dns-14B-120 px-3 py-1 transition-colors ${
              mode === 'qa'
                ? 'bg-key-900 text-white'
                : 'bg-solid-gray-50 text-solid-gray-700 hover:bg-solid-gray-100'
            }`}
          >
            {t('chat.modeQa')}
          </button>
          <button
            type="button"
            onClick={() => switchMode('study')}
            className={`text-dns-14B-120 px-3 py-1 transition-colors ${
              mode === 'study'
                ? 'bg-key-900 text-white'
                : 'bg-solid-gray-50 text-solid-gray-700 hover:bg-solid-gray-100'
            }`}
          >
            {t('chat.modeStudy')}
          </button>
        </div>
      )}

      {tab === 'history' ? (
        <ChatHistoryView
          history={history}
          historyLoading={historyLoading}
          isExportingHistoryCsv={isExportingHistoryCsv}
          onExportHistoryCsv={exportHistoryCsv}
          onVideoNavigate={navigateToVideo}
        />
      ) : (
        <>
          <ChatMessagesView
            messages={messages}
            feedbackUpdatingId={feedbackUpdatingId}
            messagesContainerRef={messagesContainerRef}
            messagesEndRef={messagesEndRef}
            onVideoNavigate={navigateToVideo}
            onFeedback={handleFeedbackWithSync}
          />
          <ChatComposer
            input={input}
            isLoading={isLoading}
            onInputChange={setInput}
            onKeyDown={handleKeyPress}
            onSend={handleSend}
          />
        </>
      )}
    </div>
  );
}
