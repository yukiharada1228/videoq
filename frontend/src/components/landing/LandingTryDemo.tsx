import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { apiClient } from '@/lib/api';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Button } from '@/components/ui/button';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { useSharedGroupQuery } from '@/hooks/useSharePageData';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import {
  LANDING_PUBLIC_SAMPLES,
  landingSamplePath,
  type LandingPublicSampleKey,
} from '@/lib/landingSamples';
import { buildYoutubeEmbedSrc } from '@/lib/video/embed';
import { convertVideoInGroupToSelectedVideo } from '@/lib/utils/videoConversion';
import { linkVariants } from '@/components/ui/link';
import { cn } from '@/lib/digital-agency/cn';

const QUESTION_INDEXES = [0, 1, 2] as const;

export function LandingTryDemo() {
  const { t } = useTranslation();
  const [sampleKey, setSampleKey] = useState<LandingPublicSampleKey>('linearAlgebra');
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);

  const sample = LANDING_PUBLIC_SAMPLES.find((item) => item.key === sampleKey)
    ?? LANDING_PUBLIC_SAMPLES[0];
  const groupQuery = useSharedGroupQuery(sample.slug);
  const group = groupQuery.data ?? null;

  const handleVideoSelect = useCallback((videoId: number) => {
    setSelectedVideoId(videoId);
  }, []);

  const selectedVideo = useMemo(() => {
    if (!group?.videos?.length) return null;
    const selected = selectedVideoId
      ? group.videos.find((video) => video.id === selectedVideoId)
      : null;
    return convertVideoInGroupToSelectedVideo(selected ?? group.videos[0]);
  }, [group, selectedVideoId]);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime, youtubeStartSeconds } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
  });

  const suggestedQuestions = QUESTION_INDEXES.map((index) => (
    t(`landing.publicSamples.${sample.key}.questions.${index}`)
  ));

  const selectSample = (key: LandingPublicSampleKey) => {
    setSampleKey(key);
    setSelectedVideoId(null);
  };

  return (
    <section className="mb-12">
      <Heading size="18" hasChip className="mb-4">
        <HeadingTitle level="h2">{t('landing.demo.title')}</HeadingTitle>
      </Heading>
      <p className="mb-4 text-std-16N-170 text-solid-gray-700">{t('landing.demo.intro')}</p>

      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label={t('landing.publicSamples.title')}
      >
        {LANDING_PUBLIC_SAMPLES.map((item) => {
          const selected = item.key === sampleKey;
          return (
            <Button
              key={item.slug}
              type="button"
              variant={selected ? 'solid' : 'outline'}
              size="sm"
              aria-pressed={selected}
              onClick={() => selectSample(item.key)}
            >
              {t(`landing.publicSamples.${item.key}.title`)}
            </Button>
          );
        })}
      </div>

      <p className="mb-4 text-std-16N-170 text-solid-gray-700">
        {t(`landing.publicSamples.${sample.key}.body`)}
      </p>

      <div className="border border-solid-gray-420">
        {groupQuery.isLoading ? (
          <div className="flex min-h-[24rem] items-center justify-center">
            <InlineSpinner className="h-8 w-8" />
          </div>
        ) : groupQuery.isError || !group ? (
          <div className="flex min-h-[16rem] flex-col items-start justify-center gap-3 p-6">
            <p className="text-std-16N-170 text-solid-gray-700">{t('landing.demo.loadError')}</p>
            <Link href={landingSamplePath(sample.slug)} className={linkVariants()}>
              {t('landing.demo.openFull')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="flex flex-col border-b border-solid-gray-420 lg:col-span-7 lg:border-b-0 lg:border-r">
              <div className="border-b border-solid-gray-420 px-4 py-3 text-std-16B-170 text-solid-gray-800">
                {selectedVideo?.title ?? group.name}
              </div>
              <div className="aspect-video bg-solid-gray-800">
                {selectedVideo?.source_type === 'youtube' && selectedVideo.youtube_embed_url ? (
                  <iframe
                    key={`${selectedVideo.id}-${youtubeStartSeconds ?? 0}`}
                    className="h-full w-full"
                    src={buildYoutubeEmbedSrc(selectedVideo.youtube_embed_url, youtubeStartSeconds)}
                    title={selectedVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : selectedVideo?.file ? (
                  <video
                    ref={videoRef}
                    key={selectedVideo.id}
                    controls
                    className="h-full w-full object-contain"
                    src={apiClient.getSharedVideoUrl(selectedVideo.file, sample.slug)}
                    onCanPlay={handleVideoCanPlay}
                  >
                    {t('common.messages.browserNoVideoSupport')}
                  </video>
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-std-16N-170 text-solid-gray-420">
                    {t('videos.shared.playerPlaceholder')}
                  </div>
                )}
              </div>
              <div className="border-t border-solid-gray-420">
                <p className="px-4 py-3 text-dns-14B-120 text-solid-gray-800">
                  {t('landing.demo.videosLabel')}
                </p>
                <ul className="max-h-48 overflow-y-auto">
                  {(group.videos ?? []).map((video) => {
                    const selected = selectedVideo?.id === video.id;
                    return (
                      <li key={video.id}>
                        <button
                          type="button"
                          onClick={() => handleVideoSelect(video.id)}
                          className={cn(
                            'flex w-full px-4 py-3 text-left text-std-16N-170',
                            selected
                              ? 'border-l-4 border-key-900 bg-blue-50 font-medium text-solid-gray-800'
                              : 'border-l-4 border-transparent text-solid-gray-700 hover:bg-solid-gray-50',
                          )}
                        >
                          {video.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="relative min-h-[32rem] lg:col-span-5">
              <ChatPanel
                key={sample.slug}
                groupId={group.id}
                shareToken={sample.slug}
                showHistory={false}
                suggestedQuestions={suggestedQuestions}
                onVideoPlay={handleVideoPlayFromTime}
                className="h-[32rem] border-0 lg:absolute lg:inset-0 lg:h-full"
              />
            </div>
          </div>
        )}
      </div>

      {group && !groupQuery.isError ? (
        <p className="mt-4">
          <Link href={landingSamplePath(sample.slug)} className={linkVariants()}>
            {t('landing.demo.openFull')}
          </Link>
        </p>
      ) : null}

      <p className="mt-4">
        <Button variant="solid" size="lg" asChild>
          <Link href="/signup">{t('landing.tryOwn')}</Link>
        </Button>
      </p>
    </section>
  );
}
