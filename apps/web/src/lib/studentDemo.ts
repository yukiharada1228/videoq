export const STUDENT_DEMO_SUBJECTS = ['japanese', 'math', 'science', 'social', 'english'] as const;

export function studentDemoMedia(language?: string) {
  const locale = language?.startsWith('en') ? 'en' : 'ja';
  const version = locale === 'en' ? 4 : 2;
  return {
    locale,
    aspectRatio: '16 / 9',
    video: `/demo/student-demo-${locale}.mp4?v=${version}`,
    poster: `/demo/student-demo-${locale}-poster.webp?v=${version}`,
    captions: `/demo/student-demo-${locale}.vtt?v=${version}`,
  };
}
