import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';
import { useChatMessages } from '@/hooks/useChatMessages';
import { useChatHistory } from '@/hooks/useChatHistory';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatHistoryView } from '@/components/chat/ChatHistoryView';
import { ChatMessagesView } from '@/components/chat/ChatMessagesView';

interface ChatPanelProps {
  groupId?: number;
  onVideoPlay?: (videoId: number, startTime: string) => void;
  shareToken?: string;
  className?: string;
}

type PanelTab = 'chat' | 'history';

export function ChatPanel({ groupId, onVideoPlay, shareToken, className }: ChatPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PanelTab>('chat');

  const {
    messages,
    input,
    setInput,
    isLoading,
    feedbackUpdatingId,
    messagesContainerRef,
    messagesEndRef,
    handleSend,
    handleKeyPress,
    handleFeedback,
  } = useChatMessages({ groupId, shareToken });

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

  const showTabs = !!groupId && !shareToken;

  const containerClass = cn(
    'flex flex-col overflow-hidden rounded-xl bg-white',
    className ?? 'h-[500px] lg:h-[600px]',
  );

  return (
    <div className={containerClass}>
      <div className="px-4 py-3 border-b border-stone-100 shrink-0 flex items-center justify-between gap-4">
        <h2 className="font-extrabold text-[#191c19] shrink-0">{t('chat.title')}</h2>
        {showTabs && (
          <div className="flex gap-4">
            <button
              onClick={() => setTab('chat')}
              className={`text-xs font-bold pb-1 transition-colors ${
                tab === 'chat'
                  ? 'text-[#00652c] border-b-2 border-[#00652c]'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {t('chat.newConsultation')}
            </button>
            <button
              onClick={() => setTab('history')}
              className={`text-xs font-bold pb-1 transition-colors ${
                tab === 'history'
                  ? 'text-[#00652c] border-b-2 border-[#00652c]'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {t('chat.history')}
            </button>
          </div>
        )}
      </div>

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
