export const LANDING_DEMO_QUESTION_KEYS = ['start', 'order', 'check'] as const;
export type LandingDemoQuestionKey = (typeof LANDING_DEMO_QUESTION_KEYS)[number];
export const LANDING_DEMO_SCENES = [
  { key: 'start', startSeconds: 0 },
  { key: 'order', startSeconds: 20 },
  { key: 'check', startSeconds: 40 },
] as const;

export function landingDemoMedia(language?: string) {
  const locale = language?.startsWith('en') ? 'en' : 'ja';
  return {
    locale,
    shareSlug: `videoq-demo-${locale}-v1`,
    video: `/demo/explain-${locale}.mp4`,
    poster: `/demo/explain-${locale}-poster.webp`,
    captions: `/demo/explain-${locale}.vtt`,
  };
}

export function formatPlayerClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
