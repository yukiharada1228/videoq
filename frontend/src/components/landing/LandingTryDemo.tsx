import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { ChatMessagesView } from '@/components/chat/ChatMessagesView';
import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import type { Message } from '@/hooks/useChatMessages';
import type { Citation } from '@/lib/api';
import {
  LANDING_DEMO_DURATION_SECONDS,
  LANDING_DEMO_QUESTION_KEYS,
  LANDING_DEMO_SCENES,
  LANDING_DEMO_VIDEO_ID,
  formatPlayerClock,
  landingDemoSceneAt,
  matchLandingDemoQuestion,
  type LandingDemoQuestionKey,
} from '@/lib/landingSamples';

function LandingDemoPlayer({
  currentTime,
  playing,
  onTogglePlay,
  onSeek,
}: {
  currentTime: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number, options?: { play?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const scene = landingDemoSceneAt(currentTime);

  return (
    <div className="aspect-video bg-solid-gray-800 text-white">
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-4">
          <p className="text-dns-14B-120 text-solid-gray-420">
            {formatPlayerClock(currentTime)} / {t(`landing.demo.scenes.${scene.key}.title`)}
          </p>
          <h3 className="mt-2 text-std-20B-150">{t(`landing.demo.scenes.${scene.key}.title`)}</h3>
          <p className="mt-3 text-std-16N-170 text-solid-gray-200">
            {t(`landing.demo.scenes.${scene.key}.body`)}
          </p>
        </div>
        <div className="flex items-center gap-3 bg-black/40 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onTogglePlay}
            className="min-w-0 px-2"
            aria-label={playing ? t('landing.demo.pause') : t('landing.demo.play')}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={LANDING_DEMO_DURATION_SECONDS}
            step={0.25}
            value={currentTime}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="h-2 flex-1"
            aria-label={t('landing.demo.timeline')}
          />
          <span className="w-16 text-right text-dns-14N-120 text-solid-gray-200">
            {formatPlayerClock(currentTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingTryDemo() {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: 'assistant', content: t('landing.demo.greeting') },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const questionLabels = useMemo(
    () =>
      Object.fromEntries(
        LANDING_DEMO_QUESTION_KEYS.map((key) => [key, t(`landing.demo.questions.${key}`)]),
      ) as Record<LandingDemoQuestionKey, string>,
    [t],
  );

  const suggestedQuestions = LANDING_DEMO_QUESTION_KEYS.map((key) => questionLabels[key]);
  const lectureTitle = t('landing.demo.lectureTitle');
  const isPlaying = playing && currentTime < LANDING_DEMO_DURATION_SECONDS;

  useEffect(() => {
    if (!isPlaying) return undefined;
    const id = window.setInterval(() => {
      setCurrentTime((prev) => Math.min(prev + 0.25, LANDING_DEMO_DURATION_SECONDS));
    }, 250);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages]);

  const seekTo = useCallback((seconds: number, options?: { play?: boolean }) => {
    const next = Math.min(Math.max(seconds, 0), LANDING_DEMO_DURATION_SECONDS);
    setCurrentTime(next);
    if (options?.play) setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setPlaying(false);
      return;
    }
    if (currentTime >= LANDING_DEMO_DURATION_SECONDS) {
      setCurrentTime(0);
    }
    setPlaying(true);
  }, [currentTime, isPlaying]);

  const handleVideoNavigate = useCallback((videoId: number, startTime: string) => {
    if (videoId !== LANDING_DEMO_VIDEO_ID) return;
    const scene = LANDING_DEMO_SCENES.find((item) => item.startTime === startTime);
    seekTo(scene?.startSeconds ?? 0, { play: true });
  }, [seekTo]);

  const askQuestion = useCallback((rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question) return;

    const matched = matchLandingDemoQuestion(question, questionLabels);
    const scene = matched
      ? LANDING_DEMO_SCENES.find((item) => item.key === matched) ?? LANDING_DEMO_SCENES[0]
      : null;
    const citations: Citation[] | undefined = scene
      ? [{
          id: 1,
          video_id: LANDING_DEMO_VIDEO_ID,
          title: lectureTitle,
          start_time: scene.startTime,
          end_time: scene.endTime,
        }]
      : undefined;

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question },
      {
        role: 'assistant',
        content: matched ? `${t(`landing.demo.answers.${matched}`)}[1]` : t('landing.demo.fallback'),
        citations,
      },
    ]);
    setInput('');
    if (scene) seekTo(scene.startSeconds, { play: true });
  }, [lectureTitle, questionLabels, seekTo, t]);

  const handleSend = useCallback(async () => {
    askQuestion(input);
  }, [askQuestion, input]);

  const handleKeyPress = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      askQuestion(input);
    }
  }, [askQuestion, input]);

  return (
    <section className="mb-12">
      <Heading size="18" hasChip className="mb-4">
        <HeadingTitle level="h2">{t('landing.demo.title')}</HeadingTitle>
      </Heading>
      <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.demo.intro')}</p>

      <div className="border border-solid-gray-420">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="flex flex-col border-b border-solid-gray-420 lg:col-span-7 lg:border-b-0 lg:border-r">
            <div className="border-b border-solid-gray-420 px-4 py-3 text-std-16B-170 text-solid-gray-800">
              {lectureTitle}
            </div>
            <LandingDemoPlayer
              currentTime={currentTime}
              playing={isPlaying}
              onTogglePlay={togglePlay}
              onSeek={seekTo}
            />
          </div>

          <div className="relative min-h-[32rem] lg:col-span-5">
            <div className="flex h-[32rem] flex-col overflow-hidden bg-white lg:absolute lg:inset-0 lg:h-full">
              <div className="shrink-0 border-b border-solid-gray-200 px-4 py-3">
                <Heading size="18">
                  <HeadingTitle level="h3">{t('chat.title')}</HeadingTitle>
                </Heading>
              </div>
              <ChatMessagesView
                messages={messages}
                feedbackUpdatingId={null}
                messagesContainerRef={messagesContainerRef}
                messagesEndRef={messagesEndRef}
                onVideoNavigate={handleVideoNavigate}
                onFeedback={async () => undefined}
              />
              <div
                className="flex shrink-0 flex-wrap gap-2 px-4 pb-3"
                role="group"
                aria-label={t('chat.suggestedQuestions')}
              >
                {suggestedQuestions.map((question) => (
                  <Button
                    key={question}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => askQuestion(question)}
                  >
                    {question}
                  </Button>
                ))}
              </div>
              <ChatComposer
                input={input}
                isLoading={false}
                onInputChange={setInput}
                onKeyDown={handleKeyPress}
                onSend={handleSend}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4">
        <Button variant="solid" size="lg" asChild>
          <Link href="/signup">{t('landing.tryOwn')}</Link>
        </Button>
      </p>
    </section>
  );
}
