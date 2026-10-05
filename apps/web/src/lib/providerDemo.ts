export const PROVIDER_DEMO_STEPS = ['prepare', 'share', 'answer'] as const;

export function providerDemoMedia(language?: string) {
  const locale = language?.startsWith('en') ? 'en' : 'ja';
  return {
    locale,
    video: `/demo/provider-demo-${locale}.mp4?v=1`,
    poster: `/demo/provider-demo-${locale}-poster.webp?v=1`,
    captions: `/demo/provider-demo-${locale}.vtt?v=1`,
  };
}
