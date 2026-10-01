export const STUDENT_DEMO_SUBJECTS = ['japanese', 'math', 'science', 'social', 'english'] as const;

export function studentDemoMedia(language?: string) {
  const locale = language?.startsWith('en') ? 'en' : 'ja';
  return {
    locale,
    video: `/demo/student-demo-${locale}.mp4?v=2`,
    poster: `/demo/student-demo-${locale}-poster.webp?v=2`,
    captions: `/demo/student-demo-${locale}.vtt?v=2`,
  };
}
