import { Fragment, useState } from 'react';
import { type ChatHistoryItem, type Citation } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';
import { cn } from '@/lib/utils';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useTranslation } from 'react-i18next';
import { useChatMessages, type Message } from '@/hooks/useChatMessages';
import { useChatHistory } from '@/hooks/useChatHistory';
import { BookOpen, ThumbsUp, ThumbsDown, Send, Download } from 'lucide-react';

// ── Message bubble ────────────────────────────────────────────────────────────

interface ChatMessageBubbleProps {
  message: Message;
  feedbackUpdatingId: number | null;
  onVideoNavigate: (videoId: number, startTime: string) => void;
  onFeedback: (chatLogId: number, value: 'good' | 'bad') => Promise<void>;
}

function MessageBody({
  content,
  citations,
  onVideoNavigate,
}: {
  content: string;
  citations?: Citation[];
  onVideoNavigate: (videoId: number, startTime: string) => void;
}) {
  const formatInlineTime = (time: string | undefined) => {
    if (!time) return '';
    const main = time.split(',')[0];
    return main.replace(/^00:/, '').replace(/^0(\d:)/, '$1');
  };

  const formatTimeRange = (startTime: string | undefined, endTime: string | undefined) => {
    const start = formatInlineTime(startTime);
    const end = formatInlineTime(endTime);
    if (start && end) return `${start}-${end}`;
    return start || end;
  };

  const tagPattern = /<ref\s+ids="([^"]+)">([\s\S]*?)<\/ref>/g;
  const nodes: Array<
    | { type: 'text'; value: string }
    | { type: 'ref'; ids: number[]; text: string }
  > = [];
  let lastIndex = 0;

  for (const match of content.matchAll(tagPattern)) {
    const fullMatch = match[0];
    const idsText = match[1];
    const refText = match[2];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push({ type: 'text', value: content.slice(lastIndex, start) });
    }

    const ids = idsText
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (ids.length > 0 && refText) {
      nodes.push({ type: 'ref', ids, text: refText });
    } else {
      nodes.push({ type: 'text', value: fullMatch });
    }

    lastIndex = start + fullMatch.length;
  }

  if (lastIndex < content.length) {
    nodes.push({ type: 'text', value: content.slice(lastIndex) });
  }

  const normalizedNodes = nodes.length > 0 ? nodes : [{ type: 'text' as const, value: content }];
  const citationMap = new Map((citations ?? []).map((citation) => [citation.id, citation]));

  return (
    <div className="text-[#3f493f] leading-relaxed whitespace-pre-wrap">
      {normalizedNodes.map((node, i) => {
        if (node.type === 'text') {
          return <Fragment key={`text-${i}`}>{node.value}</Fragment>;
        }

        const video = citationMap.get(node.ids[0]);
        if (!video) {
          return <Fragment key={`text-${i}`}>{node.text}</Fragment>;
        }

        const linkedVideos = node.ids
          .map((id) => citationMap.get(id))
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        const title = linkedVideos.map((item) => `${item.title} ${item.start_time}`).join(' / ');
        const primaryRange = formatTimeRange(video.start_time, video.end_time);

        return (
          <Fragment key={`${video.video_id}-${video.start_time}-${i}`}>
            {primaryRange && (
              <button
                type="button"
                onClick={() => onVideoNavigate(video.video_id, video.start_time)}
                className="inline text-left text-[#00652c] underline decoration-[#00652c]/35 underline-offset-3 hover:text-[#00461e] hover:decoration-[#00461e] transition-colors"
                title={title || `${video.title} ${video.start_time}`}
                aria-label={title || `${video.title} ${video.start_time}`}
              >
                {` (${primaryRange})`}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ChatMessageBubble({ message, feedbackUpdatingId, onVideoNavigate, onFeedback }: ChatMessageBubbleProps) {
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
        {message.role === 'assistant' && message.chatLogId && (
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

// ── History item ──────────────────────────────────────────────────────────────

function HistoryItem({ item, onVideoNavigate }: { item: ChatHistoryItem; onVideoNavigate: (videoId: number, startTime: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {/* timestamp */}
      <div className="flex justify-center">
        <span className="text-[10px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </div>

      {/* user question */}
      <div className="flex flex-col items-end">
        <div className="bg-[#006d30] text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm max-w-[90%] shadow-sm">
          {item.question}
        </div>
      </div>

      {/* AI answer */}
      <div className="flex flex-col items-start">
        <div className="bg-white border-l-4 border-[#00652c] rounded-2xl rounded-tl-none p-4 text-sm shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-[#00652c] font-bold text-xs">
            <BookOpen className="w-3.5 h-3.5" />
            AI {t('chat.teacher')}
          </div>
          <MessageBody
            content={item.answer}
            citations={item.citations}
            onVideoNavigate={onVideoNavigate}
          />
          {item.feedback && (
            <div className={`flex items-center gap-1 pt-1 text-[10px] font-bold ${item.feedback === 'good' ? 'text-[#00652c]' : 'text-red-400'}`}>
              {item.feedback === 'good' ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────────

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
    } else {
      const seconds = timeStringToSeconds(startTime);
      window.open(`/videos/${videoId}?t=${seconds}`, '_blank');
    }
  };

  const handleFeedbackWithSync = async (chatLogId: number, value: 'good' | 'bad') => {
    await handleFeedback(chatLogId, value);
    const targetMessage = messages.find((m) => m.chatLogId === chatLogId);
    if (targetMessage) {
      syncFeedbackInHistoryCache(chatLogId, targetMessage.feedback === value ? null : value);
    }
  };

  const showTabs = !!groupId && !shareToken;

  const containerClass = cn(
    'flex flex-col overflow-hidden rounded-xl bg-white',
    className ?? 'h-[500px] lg:h-[600px]'
  );

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="p-4 border-b border-stone-100 shrink-0">
        <h2 className="font-extrabold text-[#191c19]">{t('chat.title')}</h2>
        {showTabs && (
          <div className="flex gap-4 mt-3">
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
        /* ── History view ──────────────────────────────────────────────── */
        <div className="flex-1 flex flex-col min-h-0">
          {!historyLoading && (history?.length ?? 0) > 0 && (
            <div className="flex justify-end px-4 pt-3 shrink-0">
              <button
                onClick={() => void exportHistoryCsv()}
                disabled={isExportingHistoryCsv}
                className="flex items-center gap-1.5 text-xs font-bold text-[#00652c] hover:underline disabled:opacity-50"
              >
                {isExportingHistoryCsv ? <InlineSpinner className="w-3 h-3" /> : <Download className="w-3 h-3" />}
                {t('chat.exportCsvShort', 'CSV')}
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {historyLoading && (
              <div className="flex justify-center py-8"><InlineSpinner className="w-5 h-5 text-stone-300" /></div>
            )}
            {!historyLoading && (history?.length ?? 0) === 0 && (
              <p className="text-sm text-stone-400 text-center py-8">{t('chat.historyEmpty')}</p>
            )}
            {!historyLoading && history?.map((item, i) => (
              <div key={item.id}>
                {i > 0 && <div className="border-t border-stone-100 mb-6" />}
                <HistoryItem item={item} onVideoNavigate={navigateToVideo} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ── Chat view ─────────────────────────────────────────────────── */
        <>
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
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
          <div className="p-4 bg-[#f2f4ef] border-t border-stone-100 shrink-0">
            <div className="relative">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
                placeholder={t('chat.placeholder')}
                className="w-full bg-white rounded-2xl py-3 pl-4 pr-12 text-sm outline-none focus:ring-2 focus:ring-[#00652c]/30 shadow-inner"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="absolute right-2 top-1.5 w-9 h-9 bg-[#00652c] text-white rounded-full flex items-center justify-center hover:bg-[#005323] transition-colors active:scale-95 disabled:opacity-40"
              >
                {isLoading ? <InlineSpinner className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
